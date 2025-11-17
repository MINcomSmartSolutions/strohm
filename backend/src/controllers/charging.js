/**
 * @file Controller for handling charging session operations.
 *
 * @module controllers/charging
 * @exports charging_controller
 */

const express = require('express');
const charging_controller = express();

const {db} = require('#utils/queries');
const {verifyOdooApiKey} = require('#middlewares/auth');
const logger = require('#services/logger');
const {appErrorHandler} = require('#utils/errors');
const Joi = require('joi');

/**
 * Check if a user has an open charging session.
 * This endpoint is called from Odoo via webhook with API key authentication.
 *
 * GET /api/charging/session/active/:user_id/:partner_id
 *
 * URL Parameters:
 * - user_id: Odoo user ID (integer)
 * - partner_id: Odoo partner ID (integer)
 *
 * Returns:
 * - 200 with session data if an active session exists
 * - 200 with {hasActiveSession: false} if no active session
 * - 400 if user not found or invalid parameters
 * - 401 if API key is invalid
 * - 500 on server error
 */
charging_controller.get('/api/charging/session/active/:user_id/:partner_id', verifyOdooApiKey, async (req, res) => {
    try {
        const {user_id: req_odoo_userid, partner_id: req_odoo_partnerid} = req.params;

        // Validate URL parameters
        try {
            Joi.assert(req_odoo_userid, Joi.number().integer().positive().required());
            Joi.assert(req_odoo_partnerid, Joi.number().integer().positive().required());
        } catch (validationError) {
            logger.error('Validation error in charging session request', {
                error: validationError.message,
                params: req.params
            });
            return res.status(400).json({
                success: false,
                error: 'Invalid request parameters',
                message: validationError.message || 'user_id and partner_id must be positive integers',
            });
        }

        const odoo_user_id = parseInt(req_odoo_userid, 10);
        const odoo_partner_id = parseInt(req_odoo_partnerid, 10);

        logger.debug(`Checking for active charging session for Odoo user ${odoo_user_id}, partner ${odoo_partner_id}`);

        // Fetch user by Odoo user and partner IDs
        const user = await db.getUserUnique({
            odoo_user_id: odoo_user_id,
            odoo_partner_id: odoo_partner_id
        });

        if (!user) {
            logger.warn(`User not found for Odoo user ID: ${odoo_user_id} and partner ID: ${odoo_partner_id}`);
            return res.status(400).json({
                success: false,
                error: 'User not found',
                message: `No user found with odoo_user_id=${odoo_user_id} and odoo_partner_id=${odoo_partner_id}`,
            });
        }

        const activeSession = await db.getUserOpenChargingSession(user.user_id);

        if (activeSession) {
            logger.info(`Active charging session found for user ${user.user_id}`, {
                transaction_id: activeSession.id,
                start_timestamp: activeSession.start_timestamp,
                odoo_user_id: odoo_user_id,
                odoo_partner_id: odoo_partner_id,
            });

            return res.status(200).json({
                success: true,
                hasActiveSession: true,
                session: {
                    id: activeSession.id,
                    txn_steve_id: activeSession.txn_steve_id,
                    start_timestamp: activeSession.start_timestamp,
                    start_value: activeSession.start_value,
                    connector_id: activeSession.connector_id,
                    chargebox_pk: activeSession.chargebox_pk,
                    created_at: activeSession.created_at,
                },
            });
        } else {
            logger.debug(`No active charging session for user ${user.user_id}`);

            return res.status(200).json({
                success: true,
                hasActiveSession: false,
                session: null,
            });
        }
    } catch (error) {
        logger.error('Error checking for active charging session:', error);
        appErrorHandler(error, res);
    }
});

module.exports = charging_controller;

