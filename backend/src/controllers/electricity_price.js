/**
 * @file Controller for handling charging session operations.
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


electricity_price_controller.get('/api/electricity_price', verifyOdooApiKey, async (req, res) => {
    try {
        let datetime = req.query.datetime;
        if (datetime) {
            try {

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
        const price_data = await db.getElectricityPriceOrDefault(datetime);

        return res.status(200).json({
            success: true,
            price_data: price_data,
        });
    } catch (error) {
        logger.error('Error checking for price', error);
        appErrorHandler(error, res);
    }
});


module.exports = electricity_price_controller;