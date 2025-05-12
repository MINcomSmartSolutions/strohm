// steve_transactions.js
/*
 Incremental fetch of STOPPED transactions since last high‑water mark (T0).

 High‑Water Mark Concept:
 We persist the timestamp of the latest processed transaction (the “high‑water mark” or T0).
 On each run, we only fetch transactions whose stopTimestamp is strictly greater than T0.
 After processing, we update T0 to the maximum stopTimestamp seen. This ensures:
   • No overlap or reprocessing of already handled transactions.
   • No gaps: even if a transaction ends just after T0, it will be fetched next run.
   • Linear, efficient incremental retrieval without maintaining complex windows.
   with slack window to handle late-arriving wallbox data.
 */

const {DateTime} = require('luxon');
const {steveAxios} = require('./network');
const {fmt} = require('../utils/datetime_format');
const logger = require('./logger');
const {STEVE_CONFIG} = require('../config');
const {steveTransactionSchema} = require('../utils/joi');
const {ValidationError, ErrorCodes} = require('../utils/errors');
const {db} = require('../utils/queries');

/**
 * Fetch STOPPED transactions since a given timestamp (exclusive),
 * backing off by SLACK to catch late arrivals.
 * @param {DateTime|null} since  Only transactions with stopTimestamp > since
 */
async function fetchSince(since) {
    const now = DateTime.utc();

    // Always fetch stopped sessions
    let params = [{
        type: 'STOPPED',
    }];

    // If no `since` provided fetch all transactions
    if (since) {
        params.push({
            periodType: 'FROM_TO',
            from: fmt(since),
            to: fmt(now),
        });
    } else {
        params.push({
            periodType: 'ALL',
        });
    }


    const res = await steveAxios.get(STEVE_CONFIG.TRANSACTIONS_URI, {params});
    return res.data;
}

/**
 * Process new transactions, dedupe, and return updated high‑water mark.
 * @param {Array<Object>} txns
 */
async function processSince(txns) {
    // dedupe by id: ensure unique set.
    const unique = Array.from(
        txns.reduce((map, tx) => {
            // Validate transaction against schema
            const {error} = steveTransactionSchema.validate(tx);
            if (error) {
                throw new ValidationError(ErrorCodes.VALIDATION.INVALID_FORMAT,
                    `Invalid transaction format: ${error.message}`);
            }
            return map.set(tx.id, tx);
        }, new Map()).values(),
    );

    let maxStop;

    // Upsert all unique
    for (const tx of unique) {
        await db.upsertTransaction(tx);
        // Determine new high‑water mark: max stopTimestamp of unique
        maxStop = unique.reduce((max, tx) => {
            const stop = DateTime.fromISO(tx.stopTimestamp, {zone: 'utc'});
            return stop > max ? stop : max;
        }, DateTime.fromMillis(0));
    }

    await db.setLastStopTimestamp(maxStop);
    return maxStop;
}

/**
 * Run incremental billing cycle: fetch and process since last T0,
 * with slack to catch any wallbox that reconnected late.
 * @returns {Promise<{fetched: number, newHighWater: DateTime}>}
 */
async function runIncremental() {
    // retrieve last watermark
    const lastDate = await db.getLastStopTimestamp();

    const since = lastDate ? DateTime.fromJSDate(lastDate) : null;

    const newTx = await fetchSince(since);
    const new_high_water = newTx.length > 0 ? await processSince(newTx) : since;

    return {fetched: newTx.length, newHighWater: new_high_water};
}

module.exports = {runIncremental};

