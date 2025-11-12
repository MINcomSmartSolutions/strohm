/**
 * @file SteVe Transactions Service
 *
 * Responsible for fetching and recording transactions from the external SteVe API.
 * This service does NOT handle billing - all billing logic is in billing_reconciliation service.
 *
 * Incremental fetch strategy using high-water mark (T0):
 * We persist the timestamp of the latest processed transaction (the "high-water mark" or T0).
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
const {
    steveTransactionSchema,
    steveCompletedTransactionSchema,
} = require('#utils/joi');
const {ValidationError, ErrorCodes, SystemError} = require('#utils/errors');
const {db} = require('#utils/queries');
const logger = require('#services/logger');
const {isValidInteger} = require("#helpers/validators");


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


function txnPossiblyActive(txn) {
    const parameters = [txn.stopValue, txn.stopReason, txn.stopTimestamp];
    return parameters.every(param => param === null || param === undefined);
}


/**
 * Fetch all transactions since a given timestamp (exclusive)
 * If no timestamp is provided, fetch all transactions
 * @async
 * @param {DateTime|null} [since]  Only transactions with stopTimestamp > since
 * @returns {Promise<Array<{steve_txn}>>} Array of transactions
 */
async function fetchTxnsSince(since) {
    const now = DateTime.now();

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

        logger.verbose(`Fetching transaction from SteVe since ${since.toISO()} to ${now.toISO()}`);
    } else {
        // If `since` is not provided, fetch all transactions
        baseParams.periodType = TxnPeriodType.ALL;
        logger.verbose('Fetching all transactions from SteVe');
    }

    // Fetch both stopped and active transactions
    const stoppedParams = {...baseParams, type: TxnType.STOPPED};
    const activeParams = {...baseParams, type: TxnType.ACTIVE};

    logger.debug('Fetch parameters for stopped transactions', stoppedParams);
    logger.debug('Fetch parameters for active transactions', activeParams);

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

    if (stoppedTxns.length) logger.verbose(`Fetched ${stoppedTxns.length} stopped transaction from SteVe [${[stoppedTxns.map(txn => txn.id)]}]`);
    else logger.verbose('No stopped transaction fetched from SteVe for the period');


    if (activeTxns.length) logger.verbose(`Fetched ${activeTxns.length} active transaction from SteVe [${[activeTxns.map(txn => txn.id)]}]`);
    else logger.verbose('No active transaction fetched from SteVe for the period');


    return [...stoppedTxns, ...activeTxns];
}


// TODO: If TEMPORARY_STOP_REASON IS set for too long (e.g., >24h), consider alerting or processing it anyway.
/**
 * Stop reasons that indicate a transaction is temporarily stopped/paused
 * and should not be billed yet (may resume later).
 * According to OCPP1.6 spec
 * For now we do not handle any temporary stop reasons differently. Bill the transaction if it has stopTimestamp.
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
 * For now we do not handle any temporary stop reasons differently. Bill the transaction if it has stopTimestamp.
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
 * Record all transactions in the database.
 *
 * @async
 * @param {Array<Object<steve_txn>>} txns - Array of transactions from SteVe API
 * @returns {Promise<{maxStop: DateTime, processedTxnCount: number, completedTxnCount: number}>} The new high-water mark and count of processed transactions
 * @throws {ValidationError} If any transaction does not match the expected schema
 */
async function processTxns(txns) {
    let completedCount = 0;
    // dedupe by id: ensure unique set. To be efficient, while we are going through txns we also validate their format.
    const unique = Array.from(
        txns.reduce((map, txn) => {
            logger.verbose('Processing transaction Steve ID: ' + txn.id);
            // Validate transaction against schema
            const {error: txnError} = steveTransactionSchema.validate(txn);
            if (txnError) {
                throw new ValidationError(ErrorCodes.VALIDATION.INVALID_FORMAT, `Invalid transaction format from steve`, txnError);
            }
            const {error: completedCheckError} = steveCompletedTransactionSchema.validate(txn); // If throws error, txn is not yet completed
            if (!completedCheckError) {
                completedCount += 1;
            }
            return map.set(txn.id, txn);
        }, new Map()).values(),
    );

    logger.verbose(`Found ${unique.length} unique transactions`);

    // Record ALL transactions in database
    for (const txn of unique) {
        await db.recordTransaction(txn);
    }

    // Determine new high-water mark: max stopTimestamp of all transactions
    let maxStop;
    const transactionsWithStop = unique.filter(txn => txn.stopTimestamp);
    if (transactionsWithStop.length > 0) {
        maxStop = transactionsWithStop.reduce((max, txn) => {
            const stop = DateTime.fromISO(txn.stopTimestamp, {zone: 'utc'});
            return stop > max ? stop : max;
        }, DateTime.fromMillis(0));
    } else {
        // No stopped transactions, use current time
        maxStop = DateTime.now();
    }

    return {maxStop, processedTxnCount: unique.length, completedTxnCount: completedCount};
}

/**
 * Run incremental fetch: fetch and record transactions since last watermark
 * @async
 * @returns {Promise<{high_water_mark: DateTime, fetchedTxnCount: number, processedTxnCount: number, completedTxnCount: number}>}
 */
async function runIncremental() {
    logger.verbose('Running incremental transaction fetch');

    const since = await db.getLastStopTimestamp();

    // add 1 second to the last high water mark to prevent overlapping and fetching the same transaction
    const last_high_water = since ? since.plus(1000) : null;
    let new_watermark = since ? since : DateTime.now().toUTC();

    const new_txns = await fetchTxnsSince(last_high_water);
    let fetchedCount = new_txns.length;
    let processedCount = 0;
    let completedCount = 0;

    if (fetchedCount > 0) {
        try {
            const {maxStop, processedTxnCount: processed, completedTxnCount: completed} = await processTxns(new_txns);
            new_watermark = maxStop;
            processedCount = processed;
            completedCount = completed;

            // Only update high-water mark after successful processing to prevent transaction miss
            await db.setLastStopTimestamp(new_watermark);
        } catch (e) {
            logger.error('Failed to record transactions, high-water mark not updated', e);
            throw e;
        }
    } else {
        // No new transactions, but still update the high-water mark to current time
        await db.setLastStopTimestamp(new_watermark);
    }
    logger.info(`Incremental run completed: ${fetchedCount} transactions fetched, ${processedCount} processed, ${completedCount} was completed, ${processedCount - completedCount} was active.`);

    return {
        high_water_mark: new_watermark,
        fetchedTxnCount: fetchedCount,
        processedTxnCount: processedCount,
        completedTxnCount: completedCount,
    };
}

/**
 * Fetches all transactions from Steve, processes them, and updates the high-water mark.
 * Use for a full sync (no time filter).
 * @async
 * @returns {Promise<{fetchedTxnCount: number, processedTxnCount: number, high_water_mark: DateTime, completedTxnCount: number}>}
 */
async function runFull() {
    logger.info('Running daily full transaction fetch');

    let watermark = DateTime.now().toUTC();

    const new_txns = await fetchTxnsSince();
    let fetchedCount = new_txns.length;
    let processedCount = 0;
    let completedCount = 0;

    if (fetchedCount > 0) {
        try {
            const {maxStop, processedTxnCount: processed, completedTxnCount: completed} = await processTxns(new_txns);
            watermark = maxStop;
            processedCount = processed;
            completedCount = completed;
        } catch (e) {
            logger.error('Failed to record transactions during full fetch, high-water mark not updated', e);
        }
    }

    logger.info(`Daily full run completed: ${fetchedCount} transactions fetched, ${processedCount} processed, ${completedCount} was completed, ${processedCount - completedCount} was active.`);

    return {
        high_water_mark: watermark,
        fetchedTxnCount: fetchedCount,
        processedTxnCount: processedCount,
        completedTxnCount: completedCount
    };
}


/**
 * Fetch and process all of today's transactions and updates the high-water mark.
 * @async
 * @returns {Promise<{fetchedTxnCount: number, processedTxnCount: number, high_water_mark: DateTime, completedTxnCount: number}>}
 */
async function runToday() {
    // Get today's date and set it to midnight
    let watermark = DateTime.utc().startOf('day');

    const new_txns = await fetchTxnsSince(watermark);
    let processedCount = 0;
    let completedCount = 0;


    if (new_txns.length > 0) {
        const {maxStop, processedTxnCount: processed, completedTxnCount: completed} = await processTxns(new_txns);
        watermark = maxStop;
        processedCount = processed;
        completedCount = completed;
    }
    await db.setLastStopTimestamp(watermark);
    return {
        high_water_mark: watermark,
        fetchedTxnCount: new_txns.length,
        processedTxnCount: processedCount,
        completedTxnCount: completedCount
    };
}

module.exports = {
    runIncremental,
    runFull,
    runToday,
    TEMPORARY_STOP_REASONS,
    PERMANENT_STOP_REASONS,
    TxnPeriodType,
    TxnType,
};
