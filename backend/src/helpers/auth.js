'use strict';
/**
 * @file Helper functions for authentication and security.
 */
const crypto = require('crypto');
const {ValidationError, ErrorCodes, SystemError} = require('#utils/errors');
const logger = require('#services/logger');
const {GLOBAL_CONFIG} = require("#config");
const {get} = require("axios");


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
 * @param {number} bytes - Length of the salt in bytes (default: 16). Not the length of the resulting string!
 * @returns {string} - salt string
 */
function generateSalt(bytes = 16) {
    if (typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes <= 0) {
        throw new ValidationError(ErrorCodes.VALIDATION.INVALID_PARAMETERS, 'Salt length must be a positive integer');
    }

    return crypto.randomBytes(bytes).toString('base64url');
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
    //FIXME: TypeError: refresh_token not present in TokenSet
    if (!req) {
        logger.warn('Request object is missing in OIDC validation');
        return false;
    }

    try {
        const oidcSet = req.oidc;

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

/**
 * Cache for OIDC discovery configuration
 * Security: TTL of 24 hours prevents using stale/compromised endpoints indefinitely
 * while avoiding frequent network calls
 * OIDC discovery cache is overkill for most use cases but adds resilience.
 */
let oidcDiscoveryCache = {
    data: null,
    fetchedAt: null,
    ttl: GLOBAL_CONFIG.OIDC.DISCOVERY_CACHE_TTL,
};

/**
 * Fetches and caches the OIDC discovery configuration
 * @returns {Promise<Object>} OIDC discovery document
 * @throws {SystemError} If fetch fails
 */
async function getOidcDiscovery() {
    const now = Date.now();

    // Return cached data if valid
    if (oidcDiscoveryCache.data && oidcDiscoveryCache.fetchedAt) {
        const age = now - oidcDiscoveryCache.fetchedAt;
        if (age < oidcDiscoveryCache.ttl) {
            return oidcDiscoveryCache.data;
        }
    }

    // Fetch fresh configuration
    try {
        const response = await get(
            process.env.SERVER_OIDC_ISSUER_BASE_URL + '/.well-known/openid-configuration',
            {
                timeout: 5000, // 5 second timeout for security
                validateStatus: (status) => status === 200,
            }
        );

        // Update cache
        oidcDiscoveryCache.data = response.data;
        oidcDiscoveryCache.fetchedAt = now;

        return response.data;
    } catch (error) {
        // If we have stale cache and fetch fails, use stale cache as fallback
        if (oidcDiscoveryCache.data) {
            console.warn('OIDC discovery fetch failed, using stale cache as fallback');
            return oidcDiscoveryCache.data;
        }
        throw new SystemError(
            ErrorCodes.SYSTEM.SERVICE_UNAVAILABLE,
            'Failed to fetch OIDC specifications',
            error
        );
    }
}

module.exports = {
    generateOdooHash,
    generateSalt,
    validateOIDCProperties,
    getOidcDiscovery,
};