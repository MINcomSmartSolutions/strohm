/**
 * @file SteVe Transactions Service
 *
 * Incremental fetch of STOPPED transactions since last high‑water mark (T0).
 * High‑Water Mark Concept:
 * We persist the timestamp of the latest processed transaction (the “high‑water mark” or T0).
 * On each run, we only fetch transactions whose stopTimestamp is strictly greater than T0.
 * After processing, we update T0 to the maximum stopTimestamp seen. This ensures:
 *   • No overlap or reprocessing of already handled transactions.
 *   • No gaps: even if a transaction ends just after T0, it will be fetched next run.
 *   • Linear, efficient incremental retrieval without maintaining complex windows.
 *
 * @module services/steve_transactions
 */

const {DateTime} = require('luxon');
const {steveAxios} = require('./network');
const {fmt} = require('../utils/datetime_format');
const {STEVE_CONFIG} = require('../config');
const {steveTransactionSchema} = require('../utils/joi');
const {ValidationError, ErrorCodes} = require('../utils/errors');
const {db} = require('../utils/queries');
const {createOdooTxnInvoice} = require('./odoo');
const logger = require('../services/logger');

/**
 * Fetch STOPPED transactions since a given timestamp (exclusive)
 * If no timestamp is provided, fetch all transactions
 * @async
 * @param {DateTime|null} since  Only transactions with stopTimestamp > since
 * @returns {Promise<Array<Object>>} Array of transactions
 */
async function fetchSince(since = null) {
    const to = DateTime.now();

    // Always fetch stopped sessions
    // FIXME: STOPPED can also mean its paused. Check stop reason?!!!
    let params = {
        type: 'STOPPED',
    };

    // If `since` is provided, add periodType and date range
    if (since) {
        params.periodType = 'FROM_TO';
        params.from = fmt(since.toUTC());
        params.to = fmt(to.toUTC());
        logger.info(`Fetching transactions from SteVe since ${since.toISO()} to ${to.toISO()}`);
    } else {
        // If `since` is not provided, fetch all transactions
        params.periodType = 'ALL';
        logger.info('Fetching all transactions from SteVe');
    }


    const res = await steveAxios.get(STEVE_CONFIG.TRANSACTIONS_URI, {params});
    return res.data;
}


/**
 * Record and create bills for transactions/charging sessions
 * @async
 * @param {Array<Object>} txns
 * @returns {Promise<DateTime>} The new high‑water mark (max stopTimestamp)
 * @throws {ValidationError} If any transaction does not match the expected schema
 */
async function processSince(txns) {
    try {
        // dedupe by id: ensure unique set. To be effecient, while we are going through txns we also validate their format.
        const unique = Array.from(
            txns.reduce((map, tx) => {
                logger.info('Processing transaction: ' + tx.id);
                // Validate transaction against schema
                const {error} = steveTransactionSchema.validate(tx);
                if (error) {
                    throw new ValidationError(ErrorCodes.VALIDATION.INVALID_FORMAT,
                        `Invalid transaction format: ${error.message}`);
                }
                return map.set(tx.id, tx);
            }, new Map()).values(),
        );

        //TODO: More checks needed.
        // 1. Check if the bill already exists in Odoo
        //


        let maxStop;

        logger.info('Processing transactions since last high-water mark');
        // Record all unique
        for (const tx of unique) {
            logger.info('Recording transaction: ' + tx.id);
            const db_txn = await db.recordTransaction(tx);

            // If the transaction does not have a invoice_ref to odoo
            // and have a associated user, create a bill.
            if (!db_txn.invoice_ref && db_txn.user_id) {
                const bill_id = await createOdooTxnInvoice(db_txn);
                await db.saveInvoiceId(db_txn, bill_id);
            }

            // Determine new high‑water mark: max stopTimestamp of unique
            maxStop = unique.reduce((max, tx) => {
                const stop = DateTime.fromISO(tx.stopTimestamp, {zone: 'utc'});
                return stop > max ? stop : max;
            }, DateTime.fromMillis(0));
        }

        return maxStop;
    } catch (error) {
        logger.error('Error in processSince: ' + error);
        throw error;
    }
}

/**
 * Run incremental billing cycle: fetch and process since last T0
 * @async
 * @returns {Promise<{fetched: number, high_water_mark: DateTime}>}
 */
async function runIncremental() {
    //FIXME: What happens if proccessing fails but high-water mark is updated? BUG
    logger.info('Running incremental transaction fetch and processing');
    // retrieve the last watermark
    const since = await db.getLastStopTimestamp();

    // add 1 second to the last high water mark to prevent overlapping and fetching the same transactions
    const last_high_water = since ? since.plus(1000) : null;
    let new_high_water = since ? since : DateTime.now().toUTC();

    const new_txns = await fetchSince(last_high_water);
    if (new_txns.length > 0) {
        logger.info('Sending ' + new_txns.length + ' transactions for processing');
        new_high_water = await processSince(new_txns);
    }
    await db.setLastStopTimestamp(new_high_water);
    return {fetched: new_txns.length, high_water_mark: new_high_water};
}


/**
 * Fetches all transactions from Steve, processes them, and updates the high-water mark.
 * Use for a full sync (no time filter).
 * @async
 * @returns {Promise<{fetched: number, high_water_mark: DateTime}>}
 */
async function runFull() {
    let new_high_water = DateTime.now().toUTC();

    const new_txns = await fetchSince();
    if (new_txns > 0) {
        new_high_water = await processSince(new_txns);
    }
    await db.setLastStopTimestamp(new_high_water);
    return {fetched: new_txns.length, high_water_mark: new_high_water};
}


/**
 * Fetch and process all of today's transactions and updates the high-water mark.
 * @async
 * @returns {Promise<{fetched: number, high_water_mark: DateTime}>}
 */
async function runToday() {
    // Get today's date and set it to midnight
    let new_high_water = DateTime.utc().startOf('day');

    const new_txns = await fetchSince(new_high_water);
    if (new_txns > 0) {
        new_high_water = await processSince(new_txns);
    }
    await db.setLastStopTimestamp(new_high_water);
    return {fetched: new_txns.length, high_water_mark: new_high_water};
}

module.exports = {runIncremental};

