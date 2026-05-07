/**
 * @file Controller for handling Odoo internal user sync webhooks.
 *
 * @module controllers/odoo
 * @exports odoo_controller
 */

const express = require('express');
const odoo_controller = express();

const Joi = require("joi");
const {db} = require('#utils/queries');
const {blockSteveUser, unblockSteveUser} = require('#services/steve_user');
const {verifyOdooApiKey} = require('#middlewares/auth');
const logger = require('#services/logger');
const {appErrorHandler} = require('#utils/errors');
const {saleOrderStateChangeEventSchema, invoiceStateChangeEventSchema} = require("#utils/joi");
const {DateTime} = require("luxon");
const {isValidInteger, isValidNumber} = require("#helpers/validators");


/**
 * Odoo internal user sync webhook endpoint.
 *
 * Expects a POST request with JSON body:
 * {
 *   user_id: \<number\>,            // Odoo user ID
 *   partner_id: \<number\>,         // Odoo partner ID
 *   event: \<string\>,              // One of: 'user_deleted', 'partner_deleted', 'user_changed', 'partner_changed', 'payment_rejected'
 *   data: {                         // Event-specific payload, e.g.:
 *     record_id: \<number\>,        // ID of the affected record
 *     old_data: \<object\>,         // Previous state (optional, for changed events)
 *     new_data: \<object\>          // New state (optional, for changed events)
 *   }
 * }
 *
 * - For 'user_deleted' or 'partner_deleted': deactivates user and blocks in Steve.
 * - For 'user_changed' or 'partner_changed': (TODO) update user details.
 * - For 'payment_rejected': (TODO) handle payment rejection logic.
 * - For 'payment_validity_changed': (TODO) handle payment validity changes.
 * Responds with 200 on success, 400 on invalid input or user not found.
 * Requires API key authentication via verifyOdooApiKey middleware.
 */
odoo_controller.post('/internal/user/sync', verifyOdooApiKey, async (req, res) => {
    try {
        const {
            timestamp,
            user_id: req_odoo_userid,
            partner_id: req_odoo_partnerid,
            event,
            data,
        } = req.body;

        try {
            // Verify required fields using Joi (a bit unnecessary here, but good for consistency)
            Joi.assert(timestamp, Joi.string().isoDate().required());
            Joi.assert(req_odoo_userid, Joi.number().integer().positive());
            Joi.assert(req_odoo_partnerid, Joi.number().integer().positive());
            Joi.assert(event, Joi.string().valid(
                'user_deleted',
                'partner_deleted',
                'user_changed',
                'partner_changed',
                'payment_rejected',
                'payment_validity_changed',
            ).required());
            Joi.assert(data, Joi.object().required());
        } catch (validationError) {
            logger.error('Validation error in Odoo webhook request', {error: validationError.message, body: req.body});
            return res.status(400).json({error: 'Invalid request body'});
        }

        logger.debug(`Received Odoo webhook event: ${event}`, {data});

        // Fetch user by Odoo user and partner IDs
        const user = await db.getUserUnique({odoo_user_id: req_odoo_userid, odoo_partner_id: req_odoo_partnerid});
        if (!user) {
            logger.warn(`User not found for Odoo user ID: ${req_odoo_userid} and partner ID: ${req_odoo_partnerid}`);
            return res.status(400).json({error: 'User not found'});
        }

        // Handle deletion events
        if (event === 'user_deleted' || event === 'partner_deleted') {
            logger.info(`Handling deletion for user ${user.user_id}`);
            const deletion_type = data && data.old_data && data.old_data.deletion_type ? data.old_data.deletion_type : null;

            try {
                await db.recordActivityLog(user.user_id, 'DELETE USER', 'ODOO', user.rfid, deletion_type);
                await db.deactivateUser(user);
                await db.revokeUserOdooCredentials(user);
                await blockSteveUser(user, "Deactivated on user data deletion request");
                return res.status(200).json({success: true});
            } catch (deletionError) {
                logger.error(`Failed to handle deletion for user ${user.user_id}`, {error: deletionError.message});
                return res.status(500).json({error: 'Failed to process deletion'});
            }
        } else if (event === 'user_changed' || event === 'partner_changed') {
            logger.info(`Handling user change for user ${user.user_id}`);
            // TODO: Handle user update, the main details comes from partner_updated event
            const {record_id, old_data, new_data} = data;
            Joi.assert(old_data, Joi.object().required());
            Joi.assert(new_data, Joi.object().required());
            return res.status(200).json({success: true});

        } else if (event === 'payment_validity_changed') {
            // TODO: Update user's payment method validity
            logger.info(`Payment validity change for user ${user.user_id}`);
            const {has_valid_payment_method} = data;
            Joi.assert(has_valid_payment_method, Joi.boolean());
            return res.status(200).json({success: true});

        } else if (event === 'payment_rejected') {
            // TODO: Handle payment_rejected event
            logger.info(`Payment rejected for user ${user.user_id}`);
            return res.status(200).json({success: true});
        }

        // Default success response
        return res.status(200).json({success: true});
    } catch (error) {
        appErrorHandler(error, res);
    }
});

/**
 * POST /internal/user/suspend-charging
 *
 * Suspends a user's charging capability in SteVe (Mahnstufe 2).
 * Called from Odoo dunning process when an invoice reaches 60 days overdue.
 *
 * @middleware verifyOdooApiKey
 */
odoo_controller.post('/internal/user/suspend-charging', verifyOdooApiKey, async (req, res) => {
    try {
        let {partner_id, partner_name, reason, timestamp} = req.body;

        if (!isValidInteger(partner_id)) {
            return res.status(400).json({error: 'Invalid or missing partner_id'});
        }

        const user = await db.getUserUnique({odoo_partner_id: partner_id});
        if (!user) {
            logger.warn(`Dunning suspend: no user found for odoo_partner_id=${partner_id} (${partner_name})`);
            return res.status(404).json({error: 'User not found for given partner_id'});
        }

        if (!user.steve_id) {
            logger.warn(`Dunning suspend: user ${user.user_id} has no SteVe account, skipping block`);
            return res.status(200).json({success: true, message: 'User has no SteVe account, no action taken'});
        }

        if (reason && reason.length > 255) {
            logger.warn(`Reason for reactivating charging is too long, truncating to 255 characters`);
            reason = reason.substring(0, 255);
        }

        await blockSteveUser(user, reason);
        logger.info(`Dunning: suspended charging for user ${user.user_id} (partner_id=${partner_id})`);

        return res.status(200).json({success: true});
    } catch (error) {
        appErrorHandler(error, res);
    }
});

/**
 * POST /internal/user/reactivate-charging
 *
 * Reactivates a user's charging capability in SteVe after dunning is resolved.
 * Called from Odoo when all overdue invoices for a partner are paid.
 *
 * @middleware verifyOdooApiKey
 */
odoo_controller.post('/internal/user/reactivate-charging', verifyOdooApiKey, async (req, res) => {
    try {
        let {partner_id, partner_name, reason, timestamp} = req.body;

        if (!isValidInteger(partner_id)) {
            return res.status(400).json({error: 'Invalid or missing partner_id'});
        }

        const user = await db.getUserUnique({odoo_partner_id: partner_id});
        if (!user) {
            logger.warn(`Dunning reactivate: no user found for odoo_partner_id=${partner_id} (${partner_name})`);
            return res.status(404).json({error: 'User not found for given partner_id'});
        }

        if (!user.steve_id) {
            logger.warn(`Dunning reactivate: user ${user.user_id} has no SteVe account, skipping unblock`);
            return res.status(200).json({success: true, message: 'User has no SteVe account, no action taken'});
        }

        if (reason && reason.length > 255) {
            logger.warn(`Reason for reactivating charging is too long, truncating to 255 characters`);
            reason = reason.substring(0, 255);
        }

        await unblockSteveUser(user, reason);

        logger.info(`Dunning: reactivated charging for user ${user.user_id} (partner_id=${partner_id})`);

        return res.status(200).json({success: true});
    } catch (error) {
        appErrorHandler(error, res);
    }
});

/**
 * Odoo invoice sync webhook.
 * Handles creation, update, and deletion of invoices.
 */
odoo_controller.post('/internal/invoice', verifyOdooApiKey, async (req, res) => {
    return handleInvoiceSync(req, res);
});

odoo_controller.put('/internal/invoice/:id', verifyOdooApiKey, async (req, res) => {
    return handleInvoiceSync(req, res);
});

/**
 * DELETE /internal/invoice/:id
 *
 * Marks an invoice as cancelled in the system.
 *
 * @async
 * @param {Object} req - Express request object
 * @param {Object} req.params - Route parameters
 * @param {string} req.params.id - Odoo invoice ID to delete
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with success status
 * @throws {400} Invalid invoice ID format
 * @throws {500} Database error
 *
 * @middleware verifyOdooApiKey - Validates API key authentication
 */
odoo_controller.delete('/internal/invoice/:id', verifyOdooApiKey, async (req, res) => {
    try {
        const odoo_invoice_id = parseInt(req.params.id);
        if (!isValidInteger(odoo_invoice_id)) {
            return res.status(400).json({error: 'Invalid invoice ID'});
        }

        logger.info(`Syncing invoice deletion for invoice ${odoo_invoice_id}`);
        await db.updateTxnOdooInvoice(odoo_invoice_id, {cancelled: true});

        return res.status(200).json({success: true});
    } catch (error) {
        appErrorHandler(error, res);
    }
});

/**
 * Odoo sale order sync webhook.
 * Handles creation, update, and deletion of sale orders.
 */
odoo_controller.post('/internal/sale', verifyOdooApiKey, async (req, res) => {
    return handleSaleOrderSync(req, res);
});

odoo_controller.put('/internal/sale/:id', verifyOdooApiKey, async (req, res) => {
    return handleSaleOrderSync(req, res);
});

/**
 * DELETE /internal/sale/:id
 *
 * Marks a sale order as cancelled and records deletion timestamp.
 *
 * @async
 * @param {Object} req - Express request object
 * @param {Object} req.params - Route parameters
 * @param {string} req.params.id - Odoo sale order ID to delete
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with success status
 * @throws {400} Invalid sale order ID format
 * @throws {500} Database error
 *
 * @middleware verifyOdooApiKey - Validates API key authentication
 */
odoo_controller.delete('/internal/sale/:id', verifyOdooApiKey, async (req, res) => {
    try {
        const odoo_saleorder_id = parseInt(req.params.id);
        if (!isValidInteger(odoo_saleorder_id)) {
            return res.status(400).json({error: 'Invalid sale order ID'});
        }

        logger.info(`Syncing sale order deletion for order ${odoo_saleorder_id}`);
        await db.updateTxnOdooOrder(
            odoo_saleorder_id,
            {
                cancelled: true,
                deleted_at: DateTime.now()
            });

        return res.status(200).json({success: true});
    } catch (error) {
        appErrorHandler(error, res);
    }
});

/**
 * Handles invoice creation and updates from Odoo webhook.
 *
 * Validates invoice data against schema, upserts invoice record, and links to related sale orders.
 *
 * @async
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body containing invoice object
 * @param {Object} req.body.invoice - Invoice data from Odoo
 * @param {number} req.body.invoice.id - Odoo invoice ID
 * @param {string} req.body.invoice.name - Invoice name/number
 * @param {number} req.body.invoice.amount_total - Total invoice amount
 * @param {string} req.body.invoice.payment_state - Payment state (paid, in_payment, etc.)
 * @param {string} req.body.invoice.state - Invoice state (draft, posted, cancel)
 * @param {Array<number>} [req.body.invoice.sale_order_ids] - Related sale order IDs
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with success status
 * @throws {400} Invalid invoice data
 * @throws {500} Database error
 */
async function handleInvoiceSync(req, res) {
    try {
        const {invoice} = req.body;

        // Basic validation
        const {error} = invoiceStateChangeEventSchema.validate(invoice);
        if (error) {
            logger.error('Invalid invoice data received from Odoo', {error: error.message, invoice});
            return res.status(400).json({error: `Invalid invoice data: ${error.message}`});
        }

        const invoiceData = {
            odoo_invoice_id: invoice.id,
            odoo_invoice_name: invoice.name,
            total_amount: invoice.amount_total,
            paid: ['paid', 'in_payment'].includes(invoice.payment_state),
            cancelled: invoice.state === 'cancel'
        };

        logger.info(`Syncing invoice ${invoice.id} (${invoice.name})`);
        const upsertedInvoice = await db.upsertTxnOdooInvoice(invoice.id, invoiceData);

        // Link to sale orders if provided
        if (invoice.sale_order_ids && invoice.sale_order_ids.length > 0) {
            const localOrderIds = [];
            for (const odooOrderId of invoice.sale_order_ids) {
                const localOrderId = await db.getOdooOrderIdBySaleOrderId(odooOrderId);
                if (localOrderId) {
                    localOrderIds.push(localOrderId);
                }
            }

            if (localOrderIds.length > 0) {
                await db.linkOrderToInvoice(localOrderIds, upsertedInvoice.id);
            }
        }

        return res.status(200).json({success: true});
    } catch (error) {
        appErrorHandler(error, res);
    }
}

/**
 * Handles sale order creation and updates from Odoo webhook.
 *
 * Validates sale order data, upserts order record. If a Steve transaction ID is present,
 * creates new record; otherwise only updates existing orders.
 *
 * @async
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body containing sale_order object
 * @param {Object} req.body.sale_order - Sale order data from Odoo
 * @param {number} req.body.sale_order.id - Odoo sale order ID
 * @param {string} req.body.sale_order.name - Sale order name/number
 * @param {number} req.body.sale_order.amount_total - Total order amount
 * @param {string} req.body.sale_order.state - Order state (draft, sale, done, cancel)
 * @param {string} req.body.sale_order.invoice_status - Invoice status (upsell, invoiced, to invoice)
 * @param {Array<string>} [req.body.sale_order.session_backend_refs] - Steve transaction IDs
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with success status
 * @throws {400} Invalid sale order data
 * @throws {500} Database error
 */
async function handleSaleOrderSync(req, res) {
    try {
        const {error} = saleOrderStateChangeEventSchema.validate(req.body);
        if (error) {
            logger.error('Invalid sale order data received from Odoo', {error: error.message, body: req.body});
            return res.status(400).json({error: `Invalid sale order data: ${error.message}`});
        }
        const {sale_order: odoo_saleorder} = req.body;

        const orderData = {
            odoo_saleorder_id: odoo_saleorder.id,
            odoo_saleorder_name: odoo_saleorder.name,
            total_amount: odoo_saleorder.amount_total,
            confirmed: ['sale', 'done'].includes(odoo_saleorder.state),
            billed: odoo_saleorder.invoice_status === 'invoiced',
            cancelled: odoo_saleorder.state === 'cancel'
        };

        // Check for transaction ID that have been sent when creating the invoice session_backend_refs
        let transactionExists = false;
        let db_txn = null;

        if (odoo_saleorder.session_backend_refs && odoo_saleorder.session_backend_refs.length > 0) {
            const odoo_steve_txnId = odoo_saleorder.session_backend_refs[0];
            db_txn = await db.getTransactionBySteveTxnId(odoo_steve_txnId);
            if (db_txn) {
                transactionExists = true;
            } else {
                logger.warn(`Steve Transaction ID ${odoo_steve_txnId} from Odoo sale order ${odoo_saleorder.id} not found in database.`);
            }
        }

        logger.info(`Syncing sale order ${odoo_saleorder.id} (${odoo_saleorder.name})`);

        if (transactionExists) {
            // If we have a valid txnId, we can upsert (create or update)
            await db.upsertTxnOdooOrder(db_txn.id, orderData);
        } else {
            // If no valid txnId, we can only update if it already exists
            const existingOrderId = await db.getOdooOrderIdBySaleOrderId(odoo_saleorder.id);
            if (existingOrderId) {
                await db.updateTxnOdooOrder(odoo_saleorder.id, orderData);
            } else {
                logger.warn(`Cannot sync new sale order ${odoo_saleorder.id} without valid transaction ID`);
                // We return success to avoid Odoo retrying indefinitely, but we log the warning
            }
        }

        return res.status(200).json({success: true});
    } catch (error) {
        appErrorHandler(error, res);
    }
}

module.exports = odoo_controller;