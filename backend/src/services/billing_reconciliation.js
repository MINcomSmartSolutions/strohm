/**
 * @file Billing Reconciliation Service
 *
 * This service handles retroactive billing of transactions that were initially unbilled.
 * Common scenarios:
 * - User registered after transaction completed
 * - Transaction was updated with user info after initial processing
 * - Failed billing attempts that need retry
 *
 * @module services/billing_reconciliation
 */

const {db} = require('#utils/queries');
const {sendTxnToOdooProcessing} = require('./odoo');
const logger = require('#services/logger');
const {qualifiedTransactionSchema} = require("#utils/joi");


/**
 * Process a single unbilled transaction: attempt to associate user and create invoice
 *
 * @async
 * @param {Object<db_txn>} txn - The unbilled transaction
 * @returns {Promise<{success: boolean, txn_id: number, user_associated: boolean, invoice_created: boolean, invoice_id: number|null, order_id: number | null, error: string|null}>}
 */
async function processSingleUnbilledTransaction(txn) {
    const result = {
        txn_id: txn.id,
        success: false,
        user_associated: false,
        user_already_associated: false,
        invoice_created: false,
        invoice_id: null,
        order_id: null,
        error: null,
    };

    // Defensive check: if order already exists, skip billing
    const existingOrderORInvoices = await db.getTxnOdooDetails(txn.id);
    if (existingOrderORInvoices && existingOrderORInvoices.length > 0) {
        result.error = `Transaction already has order(s) in Odoo`;
        logger.warn(`Cannot bill transaction ${txn.id}: ${result.error}`);
        return result;
    }

    try {
        let user_id = txn.user_id;

        // If no user is associated, try to find and associate one
        if (!user_id) {
            logger.verbose(`Attempting to associate user for transaction ${txn.id}`);
            user_id = await db.tryAssociateUserToTransaction(txn);

            if (user_id) {
                result.user_associated = true;
                // Update the transaction object with the new user_id for billing
                txn.user_id = user_id;
            } else {
                result.error = 'No user found for transaction RFID';
                logger.warn(`Cannot bill transaction ${txn.id}: No user found for RFID ${txn.ocpp_id_tag}`);
                return result;
            }
        }

        // Let user association happen if needed, before billing attempt
        const {error} = qualifiedTransactionSchema.validate(txn);
        if (error) {
            result.error = `Transaction is not billable: ${error.message}`;
            logger.warn(`Cannot bill transaction ${txn.id}: ${result.error}`);
            return result;
        }

        // Now attempt to create invoice
        if (user_id) {
            result.user_already_associated = !result.user_associated;
            logger.info(`Creating order/invoice for transaction ${txn.id} (Steve ID: ${txn.txn_steve_id})`);
            const odooResult = await sendTxnToOdooProcessing(txn);

            if (odooResult && odooResult.order_id) {
                result.invoice_created = !!odooResult.invoice_id;
                result.order_id = odooResult.order_id;
                result.invoice_id = odooResult.invoice_id || null;
                result.success = true;
                logger.info(`Successfully created order ${odooResult.order_id} for transaction ${txn.id}` +
                    (odooResult.invoice_id ? ` with invoice ${odooResult.invoice_id}` : ''));
            } else {
                result.error = 'Failed to create or process Odoo order/invoice';
                logger.error(`Fail to bill transaction ${txn.id} : ${result.error}`);
            }
        }

        return result;
    } catch (error) {
        result.error = error.message || 'Unknown error';
        logger.error(`Error processing unbilled transaction ${txn.id}:`, error);
        return result;
    }
}

/**
 * Run billing reconciliation for all unbilled transactions
 *
 * @async
 * @param {Object} options - Reconciliation options
 * @param {number} [options.limit] - Maximum number of transactions to process in one run
 * @returns {Promise<{
 *   processed: number,
 *   users_associated: number,
 *   invoices_created: number,
 *   orders_created: number,
 *   failed: number,
 *   results: Array<Object>
 * }>}
 */
async function runBillingReconciliation(options = {}) {
    const {limit = 100} = options;

    logger.info(`Starting billing reconciliation (limit: ${limit})`);

    const stats = {
        processed: 0,
        users_associated: 0,
        invoices_created: 0,
        orders_created: 0,
        failed: 0,
        results: [],
    };

    try {
        const unbilledTxns = await db.getUnbilledTransactions({limit});

        if (unbilledTxns.length === 0) {
            logger.verbose('No unbilled transactions found');
            return stats;
        }

        // Process each transaction
        for (const txn of unbilledTxns) {
            logger.verbose(`Processing transaction ID: ${txn.id}, Steve ID: ${txn.txn_steve_id}`);
            const result = await processSingleUnbilledTransaction(txn);

            stats.processed++;

            if (result.user_associated) {
                stats.users_associated++;
            }
            if (result.invoice_created) {
                stats.invoices_created++;
            }
            if (!result.success) {
                stats.failed++;
            }
            if (result.order_id) {
                stats.orders_created++;
            }

            stats.results.push(result);
        }

        logger.verbose(`Billing reconciliation complete: ${stats.processed} processed, ${stats.users_associated} users associated, ${stats.invoices_created} invoices created, ${stats.failed} failed.`);

        return stats;
    } catch (error) {
        logger.error('Error during billing reconciliation:', error);
        throw error;
    }
}

/**
 * Get summary statistics of unbilled transactions
 *
 * @async
 * @returns {Promise<{total_unbilled: number, unbilled_with_user: number, unbilled_without_user: number}>}
 */
async function getUnbilledTransactionStats() {
    try {
        const allUnbilled = await db.getUnbilledTransactions({});

        const withUser = allUnbilled.filter(txn => txn.user_id !== null);
        const withoutUser = allUnbilled.filter(txn => txn.user_id === null);

        return {
            total_unbilled: allUnbilled.length,
            unbilled_with_user: withUser.length,
            unbilled_without_user: withoutUser.length,
        };
    } catch (error) {
        logger.error('Error getting unbilled transaction stats:', error);
        throw error;
    }
}

module.exports = {
    runBillingReconciliation,
    processSingleUnbilledTransaction,
    getUnbilledTransactionStats,
};

