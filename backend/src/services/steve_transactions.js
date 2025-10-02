/**
 * @file SteVe Transactions Service
 *
 * Incremental fetch of all transactions since last high‑water mark (T0).
 * Records all transactions in database, but only bills permanently stopped ones.
 * High‑Water Mark Concept:
 * We persist the timestamp of the latest processed transaction (the "high‑water mark" or T0).
 * On each run, we only fetch transactions whose stopTimestamp is strictly greater than T0.
 * After processing, we update T0 to the maximum stopTimestamp seen. This ensures:
 *   • No overlap or reprocessing of already handled transactions.
 *   • No gaps: even if a transaction ends just after T0, it will be fetched next run.
 *   • Linear, efficient incremental retrieval without maintaining complex windows.
 *
 * Steve API docs: Steve http://instance:port/steve/manager/swagger-ui/swagger-ui/index.html
 *
 * @module services/steve_transactions
 */
const {DateTime} = require('luxon');
const {steveAxios} = require('./network');
const {fmt} = require('#utils/datetime_format');
const {STEVE_CONFIG} = require('#config');
const {steveTransactionSchema} = require('#utils/joi');
const {ValidationError, ErrorCodes, SystemError} = require('#utils/errors');
const {db} = require('#utils/queries');
const {createOdooTxnInvoice} = require('./odoo');
const logger = require('#services/logger');


// Transaction fetch parameters according to Steve API
const TxnPeriodType = Object.freeze({
    ALL: 'ALL', // default in SteVe
    TODAY: 'TODAY',
    LAST_10: 'LAST_10',
    LAST_30: 'LAST_30',
    LAST_90: 'LAST_90',
    FROM_TO: 'FROM_TO', // requires `from` and `to` params
});

// Transaction types according to Steve API
const TxnType = Object.freeze({
    ALL: 'ALL', // default in SteVe, ignores FROM_TO variable and returns all transactions
    ACTIVE: 'ACTIVE',
    STOPPED: 'STOPPED',
});


/**
 * Fetch all transactions since a given timestamp (exclusive)
 * If no timestamp is provided, fetch all transactions
 * @async
 * @param {DateTime|null} since  Only transactions with stopTimestamp > since
 * @returns {Promise<Array<{steve_txn}>>} Array of transactions
 */
async function fetchTxnsSince(since) {
    const now = DateTime.now();


// Fetch all transactions (both active and stopped) to record them in database
    let baseParams = {};

// If `since` is provided, add periodType and date range
    if (since) {
        if (!since.isValid) {
            throw new ValidationError(ErrorCodes.VALIDATION.INVALID_FORMAT, `Invalid 'since' DateTime: ${since.invalidExplanation}`);
        }
        // Validate that since is before now
        if (since > now) {
            throw new ValidationError(ErrorCodes.VALIDATION.INVALID_FORMAT, `'since' timestamp must be before than current time. since: ${since.toISO()}, now: ${now.toISO()}`);
        }

        baseParams.periodType = TxnPeriodType.FROM_TO;
        baseParams.from = fmt(since.toUTC());
        baseParams.to = fmt(now.toUTC());

        logger.info(`Fetching transactions from SteVe since ${since.toISO()} to ${now.toISO()}`);
    } else {
        // If `since` is not provided, fetch all transactions
        baseParams.periodType = TxnPeriodType.ALL;
        logger.info('Fetching all transactions from SteVe');
    }

    // Fetch both stopped and active transactions
    const stoppedParams = {...baseParams, type: TxnType.STOPPED};
    const activeParams = {...baseParams, type: TxnType.ACTIVE};

    logger.verbose('Fetch parameters for stopped transactions', stoppedParams);
    logger.verbose('Fetch parameters for active transactions', activeParams);

    const [stoppedRes, activeRes] = await Promise.all([
        steveAxios.get(STEVE_CONFIG.TRANSACTIONS_URI, {params: stoppedParams}),
        steveAxios.get(STEVE_CONFIG.TRANSACTIONS_URI, {params: activeParams}),
    ]);

    if (stoppedRes.status !== 200) {
        throw new SystemError(ErrorCodes.STEVE.NO_RESPONSE, {res: stoppedRes});
    }
    if (activeRes.status !== 200) {
        throw new SystemError(ErrorCodes.STEVE.NO_RESPONSE, {res: activeRes});
    }

    const stoppedTxns = stoppedRes?.data || [];
    const activeTxns = activeRes?.data || [];

    logger.verbose(`Fetched ${stoppedTxns.length} stopped transactions from SteVe`, stoppedTxns ? {
        sample: stoppedTxns.slice(0, 2),
    } : undefined);
    logger.verbose(`Fetched ${activeTxns.length} active transactions from SteVe`, activeTxns ? {
        sample: activeTxns.slice(0, 2),
    } : undefined);

    return [...stoppedTxns, ...activeTxns];
}


/**
 * Stop reasons that indicate a transaction is temporarily stopped/paused
 * and should not be billed yet (may resume later).
 * According to OCPP1.6 spec
 */
const TEMPORARY_STOP_REASONS = new Set([
    'EmergencyStop',    // Emergency stop - may resume after issue resolved
    'PowerLoss',        // Power loss - may resume when power restored
    'EVDisconnected',   // EV disconnected - may be plugged back in
    null,               // No reason provided - assume it is active
    undefined,           // No reason provided - assume it is active
]);

/**
 * Stop reasons that indicate a permanent transaction end
 * and should be processed for billing.
 * According to OCPP1.6 spec
 */
const PERMANENT_STOP_REASONS = new Set([
    'DeAuthorized',     // User was deauthorized - transaction complete
    'Local',            // Stopped locally - user intended to end
    'Remote',           // Stopped remotely - operator intended to end
    'HardReset',        // Hard reset - transaction terminated
    'SoftReset',        // Soft reset - transaction terminated
    'Reboot',           // Reboot - transaction terminated
    'UnlockCommand',    // Unlock command - transaction complete
    'Other',            // Other reasons - assume complete
]);

/**
 * Determines if a transaction should be processed for billing based on its stop reason
 * @param {Object<steve_txn>} txn - Transaction object
 * @returns {boolean} True if transaction should be billed
 */
function shouldProcessTransaction(txn) {
    const stop_reason = txn.stopReason ?? null;
    const stop_timestamp = txn.stopTimestamp ?? null;

    if (!stop_timestamp) {
        // The txn is possibly active
        return false;
    }

    if (stop_timestamp && TEMPORARY_STOP_REASONS.has(stop_reason)) {
        logger.warn('Discrepancy in the txn data: stop_timestamp is set but stop_reason indicates temporary stop. Transaction ID: ' + txn.id);
    }

    // If it's a known temporary stop reason, don't process yet
    if (TEMPORARY_STOP_REASONS.has(stop_reason)) {
        logger.info(`Skipping transaction ${txn.id} with temporary stop reason: ${stop_reason}`);
        return false;
    }

    // If it's a known permanent stop reason, process it
    if (PERMANENT_STOP_REASONS.has(stop_reason)) {
        return true;
    }


    // For unknown stop reasons, log a warning and process conservatively
    logger.warn(`Unknown stop reason '${stop_reason}' for transaction ${txn.id}, processing for billing`);
    return true;
}

/**
 * Record all transactions and create bills for permanently stopped transactions
 * @async
 * @param {Array<Object<steve_txn>>} txns
 * @returns {Promise<{maxStop: DateTime, processedCount: number, billedCount: number}>} The new high‑water mark (max stopTimestamp), count of all processed transactions, and count of billed transactions
 * @throws {ValidationError} If any transaction does not match the expected schema
 */
async function processTxns(txns) {
    // dedupe by id: ensure unique set. To be effecient, while we are going through txns we also validate their format.
    const unique = Array.from(
        txns.reduce((map, txn) => {
            logger.info('Processing transaction: ' + txn.id);
            // Validate transaction against schema
            const {error} = steveTransactionSchema.validate(txn);
            if (error) {
                throw new ValidationError(ErrorCodes.VALIDATION.INVALID_FORMAT, `Invalid transaction format`, error);
            }
            return map.set(txn.id, txn);
        }, new Map()).values(),
    );

    // Filter transactions based on stop reason for billing
    const billableTransactions = unique.filter(shouldProcessTransaction);

    //TODO: More checks needed.
    // 1. Check if the bill already exists in Odoo
    //

    let maxStop;

    logger.info('Processing transactions since last high-water mark');
    logger.info(`Found ${unique.length} unique transactions, ${billableTransactions.length} billable transactions`);

    // Record ALL transactions in database regardless of billing status
    for (const txn of unique) {
        logger.info('Recording transaction: ' + txn.id);
        const db_txn = await db.recordTransaction(txn);

        // Only create bills for transactions with permanent stop reasons
        if (shouldProcessTransaction(txn)) {
            // If the transaction does not have a invoice_ref to odoo
            // and have a associated user, create a bill.
            if (!db_txn.invoice_ref && db_txn.user_id) {
                logger.info('Creating bill for transaction: ' + txn.id);
                const bill_id = await createOdooTxnInvoice(db_txn);
                await db.saveInvoiceId(db_txn, bill_id);
                logger.info(`Created bill ${bill_id} for transaction ${txn.id}`);
            }
        } else {
            logger.info(`Transaction ${txn.id} recorded but not billed due to its state: ${txn.stopReason}`);
        }
    }

    // Determine new high‑water mark: max stopTimestamp of ALL unique transactions (not just billable ones)
    // This ensures we don't re-fetch temporarily stopped transactions on the next run
    maxStop = unique.reduce((max, txn) => {
        const stop = DateTime.fromISO(txn.stopTimestamp, {zone: 'utc'});
        return stop > max ? stop : max;
    }, DateTime.fromMillis(0));

    return {maxStop, processedCount: unique.length, billedCount: billableTransactions.length};
}

/**
 * Run incremental billing cycle: fetch and process since last watermark
 * @async
 * @returns {Promise<{fetched: number, billed: number, high_water_mark: DateTime}>}
 */
async function runIncremental() {
    logger.info('Running incremental transaction fetch and processing');

    const since = await db.getLastStopTimestamp();

    // add 1 second to the last high water mark to prevent overlapping and fetching the same transaction
    const last_high_water = since ? since.plus(1000) : null;
    let new_watermark = since ? since : DateTime.now().toUTC();

    const new_txns = await fetchTxnsSince(last_high_water);
    let processedCount = 0;
    let billedCount = 0;

    if (new_txns.length > 0) {
        logger.info('Sending ' + new_txns.length + ' transactions for processing');
        try {
            const {maxStop, processedCount: processed, billedCount: billed} = await processTxns(new_txns);
            new_watermark = maxStop;
            processedCount = processed;
            billedCount = billed;

            // Only update high-water mark after successful processing to prevent transaction miss
            await db.setLastStopTimestamp(new_watermark);
        } catch (e) {
            logger.error('Failed to process transactions, high-water mark not updated', e);
            throw e;
        }
    } else {
        // No new transactions, but still update the high-water mark to current time
        await db.setLastStopTimestamp(new_watermark);
    }

    return {fetched: processedCount, billed: billedCount, high_water_mark: new_watermark};
}

/**
 * Fetches all transactions from Steve, processes them, and updates the high-water mark.
 * Use for a full sync (no time filter).
 * @async
 * @returns {Promise<{fetched: number, billed: number, high_water_mark: DateTime}>}
 */
async function runFull() {
    let watermark = DateTime.now().toUTC();

    const new_txns = await fetchTxnsSince();
    let processedCount = 0;
    let billedCount = 0;

    if (new_txns.length > 0) {
        const {maxStop, processedCount: processed, billedCount: billed} = await processTxns(new_txns);
        watermark = maxStop;
        processedCount = processed;
        billedCount = billed;
    }
    await db.setLastStopTimestamp(watermark);
    return {fetched: processedCount, billed: billedCount, high_water_mark: watermark};
}


/**
 * Fetch and process all of today's transactions and updates the high-water mark.
 * @async
 * @returns {Promise<{fetched: number, billed: number, high_water_mark: DateTime}>}
 */
async function runToday() {
    // Get today's date and set it to midnight
    let watermark = DateTime.utc().startOf('day');

    const new_txns = await fetchTxnsSince(watermark);
    let processedCount = 0;
    let billedCount = 0;

    if (new_txns.length > 0) {
        const {maxStop, processedCount: processed, billedCount: billed} = await processTxns(new_txns);
        watermark = maxStop;
        processedCount = processed;
        billedCount = billed;
    }
    await db.setLastStopTimestamp(watermark);
    return {fetched: processedCount, billed: billedCount, high_water_mark: watermark};
}

module.exports = {
    runIncremental,
    TEMPORARY_STOP_REASONS,
    PERMANENT_STOP_REASONS,
    TxnPeriodType,
    TxnType,
};
