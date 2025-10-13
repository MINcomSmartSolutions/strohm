'use strict';
/**
 * @file Helper functions for authentication and security.
 */
const crypto = require('crypto');
const {ValidationError, ErrorCodes} = require('#utils/errors');
const logger = require('#services/logger');


/**
 * Generate HMAC signature matching Odoo implementation
 * @param message
 * @param {string} secret - Shared secret key
 * @returns {string} - Hexadecimal signature
 */
function generateOdooHash(message, secret) {
    if (!message || typeof message !== 'string' || !message.trim() ||
        !secret || typeof secret !== 'string' || !secret.trim()) {
        throw new ValidationError(ErrorCodes.VALIDATION.INVALID_PARAMETERS);
    }
    return crypto
        .createHmac('sha256', secret)
        .update(message, 'utf8')
        .digest('hex');
}


/**
 * Generate a cryptographically secure random salt
 * @param {number} length - Length of the salt in bytes (default: 16)
 * @returns {string} - salt string
 */
function generateSalt(length = 16) {
    return crypto.randomBytes(length).toString('base64url');
}

/**
 * Validates that the OIDC authentication properties like access token and user info are present.
 * Most of the checks are done by the OIDC library, but we add some little extra checks.
 *
 * @async
 * @param {Object} req - Express request object
 * @returns {boolean} - True if authentication is valid, false otherwise
 */
async function validateOIDCProperties(req) {
    if (!req) {
        logger.warn('Request object is missing in OIDC validation');
        return false;
    }

    try {
        const oidcSet = req.oidc;

        // First check and most important: Is the user trusted by the OIDC library?
        if (!oidcSet.isAuthenticated()) {
            return false;
        }

        let accessToken = oidcSet.accessToken; // OIDC token object, not just the string
        // Check if the acces token is expired, and if it is refresh it
        if (accessToken.isExpired()) {
            accessToken = await accessToken.refresh();
        }

        if (!accessToken.access_token) {
            logger.warn('OIDC session missing access_token');
            return false;
        }

        if (!oidcSet.user || !oidcSet.user.sub) {
            logger.warn('OIDC session details are missing user information');
            return false;
        }

        return true;
    } catch (error) {
        logger.error('Error validating OIDC token consistency:', error);
        return false;
    }
}

function createRequestId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

module.exports = {
    generateOdooHash,
    generateSalt,
    validateOIDCProperties,
    createRequestId,
};