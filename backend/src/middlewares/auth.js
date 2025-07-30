'use strict';
/**
 * @file Middleware for API key authentication between Odoo and the server, and SCIM HTTP Basic authentication.
 */

const {SystemError, ErrorCodes} = require('../utils/errors');
const logger = require('../services/logger');

const verifyOdooApiKey = (req, res, next) => {
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

/**
 * SCIM HTTP Basic Authentication Middleware
 * Implements HTTP Basic authentication for SCIM endpoints as specified in RFC 7617
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const scimAuth = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            logger.warn('SCIM auth failed: No authorization header');
            return res.status(401).json({
                schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
                detail: 'Authorization header is required',
                status: '401'
            });
        }

        if (!authHeader.startsWith('Basic ')) {
            logger.warn('SCIM auth failed: Invalid authentication scheme');
            return res.status(401).json({
                schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
                detail: 'HTTP Basic authentication required',
                status: '401'
            });
        }

        const base64Credentials = authHeader.substring(6); // Remove 'Basic ' prefix
        let credentials;

        try {
            credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
        } catch (error) {
            logger.warn('SCIM auth failed: Invalid Base64 encoding');
            return res.status(401).json({
                schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
                detail: 'Invalid credentials encoding',
                status: '401'
            });
        }

        const [username, password] = credentials.split(':');

        if (!username || !password) {
            logger.warn('SCIM auth failed: Missing username or password');
            return res.status(401).json({
                schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
                detail: 'Username and password are required',
                status: '401'
            });
        }

        // Verify credentials against environment variables
        const expectedUsername = process.env.SERVER_SCIM_USERNAME;
        const expectedPassword = process.env.SERVER_SCIM_PASSWORD;

        if (!expectedUsername || !expectedPassword) {
            logger.error('SCIM auth failed: Missing SCIM credentials in environment');
            throw new SystemError(ErrorCodes.AUTH.KEY_MISSING);
        }

        // Constant-time comparison to prevent timing attacks
        const usernameValid = username.length === expectedUsername.length &&
            username === expectedUsername;
        const passwordValid = password.length === expectedPassword.length &&
            password === expectedPassword;

        if (!usernameValid || !passwordValid) {
            logger.warn(`SCIM auth failed: Invalid credentials for user: ${username}`);
            return res.status(401).json({
                schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
                detail: 'Invalid username or password',
                status: '401'
            });
        }

        logger.info(`SCIM auth successful for user: ${username}`);
        next();

    } catch (error) {
        logger.error('SCIM auth error:', error);

        if (error instanceof SystemError) {
            return res.status(error.errorDef.status || 500).json({
                schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
                detail: error.errorDef.message,
                status: String(error.errorDef.status || 500)
            });
        }

        return res.status(500).json({
            schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
            detail: 'Internal server error during authentication',
            status: '500'
        });
    }
};

module.exports = {
    verifyOdooApiKey,
    scimAuth
};
