const crypto = require('crypto');


/**
 * Generate HMAC signature matching Odoo implementation
 * @param state - State parameter
 * @param {string} secret - Shared secret key
 * @returns {string} - Hexadecimal signature
 */
function generateSignature(state, secret) {
    const message = `${state.key}${state.timestamp}${state.odoo_user_id}${state.salt}`;
    return crypto
        .createHmac('sha256', secret)
        .update(message)
        .digest('hex');
}


module.exports = {generateSignature};