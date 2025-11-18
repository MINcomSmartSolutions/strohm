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
const {blockSteveUser} = require('#services/steve_user');
const {verifyOdooApiKey} = require('#middlewares/auth');
const logger = require('#services/logger');
const {appErrorHandler} = require('#utils/errors');

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
            try {
                await db.deactivateUser(user);
                await db.revokeUserOdooCredentials(user);
                await blockSteveUser(user, "Deactivated on user data deletion request");
                await db.recordActivityLog(user.user_id, 'DELETE USER', 'ODOO', user.rfid);
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

module.exports = odoo_controller;