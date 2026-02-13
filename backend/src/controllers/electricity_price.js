/**
 * @file Controller for handling electricity price
 *
 * @module controllers/electricity_price
 * @exports electricity_price_controller
 */

const express = require('express');
const electricity_price_controller = express();

const Joi = require('joi');
const {DateTime} = require("luxon");
const {db} = require('#utils/queries');
const {verifyOdooApiKey} = require('#middlewares/auth');
const logger = require('#services/logger');
const {appErrorHandler} = require('#utils/errors');


/**
 * GET /api/electricity_price
 *
 * Retrieves electricity price data for a given datetime or returns default price.
 *
 * @async
 * @param {Object} req - Express request object
 * @param {Object} req.query - Query parameters
 * @param {string} [req.query.datetime] - ISO 8601 formatted datetime string for price lookup
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with success status and price_data
 * @throws {400} Invalid datetime format
 * @throws {500} Server error
 *
 * @middleware verifyOdooApiKey - Validates API key authentication
 */
electricity_price_controller.get('/api/electricity_price', verifyOdooApiKey, async (req, res) => {
    try {
        // Parse and validate optional datetime query parameter
        let datetime = req.query.datetime;
        if (datetime) {
            try {
                // Validate datetime is in ISO 8601 format
                Joi.assert(datetime, Joi.date().iso().required(), 'datetime query parameter');
                // If above does not throw, parse to DateTime
                datetime = DateTime.fromISO(datetime);
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
        }

        // Fetch electricity price for datetime or get default price
        const price_data = await db.getElectricityPriceOrDefault(datetime);
        const vat_rate = await db.getVAT(datetime);

        return res.status(200).json({
            success: true,
            price_data: price_data,
            vat_rate: vat_rate,
        });
    } catch (error) {
        logger.error('Error checking for price', error);
        appErrorHandler(error, res);
    }
});


module.exports = electricity_price_controller;