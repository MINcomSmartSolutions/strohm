const crypto = require('crypto');


/**
 * Generate HMAC signature matching Odoo implementation
 * @param {string} state - State parameter (e.g. user ID or session identifier)
 * @param {number} timestamp - Current UNIX timestamp
 * @param {string} secret - Shared secret key
 * @returns {string} - Hexadecimal signature
 */
function generateSignature(state, timestamp, secret) {
    const message = `${state}:${timestamp}`;
    return crypto
        .createHmac('sha256', secret)
        .update(message)
        .digest('hex');
}


module.exports = {generateSignature};