'use strict';
const {SystemError, ErrorCodes} = require('../utils/errors');
/**
 * @file Middleware for API key authentication between Odoo and the server.
 */

const verifyApiKey = (req, res, next) => {
    const api_key = req.headers['authorization'];
    const expected_api_key = process.env.WEBHOOK_API_KEY;
    if (!expected_api_key || expected_api_key.trim() === '' || !api_key || api_key.trim() === '') {
        throw new SystemError(ErrorCodes.AUTH.KEY_MISSING);
    }

    if (!api_key || api_key !== expected_api_key) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid or missing API key',
        });
    }

    next();
};

module.exports = verifyApiKey;
