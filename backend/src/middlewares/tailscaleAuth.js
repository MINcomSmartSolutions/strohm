/**
 * @file Tailscale Authentication Middleware
 *
 * Restricts access to endpoints based on Tailscale network membership.
 * Checks if the request originates from a Tailscale IP address.
 *
 * @module middlewares/tailscaleAuth
 */

const logger = require('#services/logger');
const {GLOBAL_CONFIG} = require('#config');
const {unsuccessfulResponse, getIP, isPrivateDevIP, isIPInCIDR} = require("#services/network");


/**
 * Middleware to ensure request comes from Tailscale network
 *
 * Checks X-Forwarded-For and X-Real-IP headers against configured Tailscale IP ranges.
 * In production, also validates that the request passed through nginx proxy.
 *
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next function
 */
function ensureTailscaleAccess(req, res, next) {
    try {
        const clientIP = getIP(req, GLOBAL_CONFIG.ENV.IS_PRODUCTION);

        // Development mode convenience: allow localhost & private RFC1918 ranges
        if (!GLOBAL_CONFIG.ENV.IS_PRODUCTION) {
            if (isPrivateDevIP(clientIP)) {
                logger.debug('Allowing private/local network access in development mode');
                return next();
            }
        }


        if (GLOBAL_CONFIG.ENV.IS_PRODUCTION && !clientIP) {
            logger.warn('Admin access attempt without proper proxy headers');
            return unsuccessfulResponse(res, 403);
        }

        logger.debug(`Admin access attempt from IP: ${clientIP}`);

        // Get allowed Tailscale IP ranges from config
        const allowedRanges = GLOBAL_CONFIG.TAILSCALE?.ALLOWED_RANGES || [];
        const allowedIPs = GLOBAL_CONFIG.TAILSCALE?.ALLOWED_IPS || [];

        if (allowedIPs.includes(clientIP)) {
            logger.info(`Admin access granted from allowed IP: ${clientIP}`);
            return next();
        }

        for (const range of allowedRanges) {
            if (isIPInCIDR(clientIP, range)) {
                logger.info(`Admin access granted from Tailscale range: ${clientIP} in ${range}`);
                return next();
            }
        }

        // Access denied
        logger.warn(`Admin access denied from IP: ${clientIP}`);
        return unsuccessfulResponse(res, 403);
    } catch (error) {
        logger.error('Error in Tailscale authentication middleware:', error);
        return unsuccessfulResponse(res, 500);
    }
}

module.exports = {
    ensureTailscaleAccess,
};
