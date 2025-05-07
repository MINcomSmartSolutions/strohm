const crypto = require('crypto');
const {ValidationError, ErrorCodes} = require('../utils/errors');


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
        .update(message)
        .digest('hex');
}


// AKA: hash
function generateEPSHash(message, secret) {
    if (!message || typeof message !== 'string' || !message.trim() ||
        !secret || typeof secret !== 'string' || !secret.trim()) {
        throw new ValidationError(ErrorCodes.VALIDATION.INVALID_PARAMETERS);
    }
    return crypto
        .createHmac('sha256', secret)
        .update(message)
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


module.exports = {
    generateOdooHash,
    generateEPSHash,
    generateSalt,
};