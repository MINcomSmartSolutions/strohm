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

/**
 * Check if an IP address is within a CIDR range
 * @param {string} ip - IP address to check
 * @param {string} cidr - CIDR range (e.g., '100.64.0.0/10')
 * @returns {boolean}
 */
function isIPInCIDR(ip, cidr) {
    const [range, bits] = cidr.split('/');
    const mask = ~(2 ** (32 - parseInt(bits)) - 1);

    const ipNum = ip.split('.').reduce((num, octet) => (num << 8) + parseInt(octet), 0) >>> 0;
    const rangeNum = range.split('.').reduce((num, octet) => (num << 8) + parseInt(octet), 0) >>> 0;

    return (ipNum & mask) === (rangeNum & mask);
}

// Helper: detect private/local IPv4 (RFC1918 + loopback) for development convenience
function isPrivateDevIP(ip) {
    if (!ip) return false;
    // Normalize IPv6-mapped IPv4
    if (ip.startsWith('::ffff:')) ip = ip.substring(7);
    if (ip === '127.0.0.1' || ip === 'localhost' || ip === '::1') return true;
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    const [a, b] = parts.map(p => parseInt(p));
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (covers docker default 172.17.x.x)
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    return false;
}

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
        // Get the real IP from headers (set by nginx)
        const forwardedFor = req.headers['x-forwarded-for'];
        const realIP = req.headers['x-real-ip'] || req.connection.remoteAddress;

        // In production, ensure we're behind nginx proxy
        if (GLOBAL_CONFIG.ENV.IS_PRODUCTION && !forwardedFor && !realIP) {
            logger.warn('Admin access attempt without proper proxy headers');
            return res.status(403).json({
                success: false,
                error: 'Access denied: Invalid request headers'
            });
        }

        // Get the actual client IP (first IP in X-Forwarded-For chain)
        let clientIP = realIP;
        if (forwardedFor) {
            clientIP = forwardedFor.split(',')[0].trim();
        }

        // Clean up IPv6-mapped IPv4 addresses
        if (clientIP && clientIP.startsWith('::ffff:')) {
            clientIP = clientIP.substring(7);
        }

        logger.debug(`Admin access attempt from IP: ${clientIP}`);

        // Get allowed Tailscale IP ranges from config
        const allowedRanges = GLOBAL_CONFIG.TAILSCALE?.ALLOWED_RANGES || [];
        const allowedIPs = GLOBAL_CONFIG.TAILSCALE?.ALLOWED_IPS || [];

        // Development mode convenience: allow localhost & private RFC1918 ranges
        if (!GLOBAL_CONFIG.ENV.IS_PRODUCTION) {
            if (isPrivateDevIP(clientIP)) {
                logger.debug('Allowing private/local network access in development mode');
                return next();
            }
        }

        // Check if IP is in allowed specific IPs
        if (allowedIPs.includes(clientIP)) {
            logger.info(`Admin access granted from allowed IP: ${clientIP}`);
            return next();
        }

        // Check if IP is in allowed CIDR ranges
        for (const range of allowedRanges) {
            if (isIPInCIDR(clientIP, range)) {
                logger.info(`Admin access granted from Tailscale range: ${clientIP} in ${range}`);
                return next();
            }
        }

        // Access denied
        logger.warn(`Admin access denied from IP: ${clientIP}`);
        return res.status(403).json({
            success: false,
            error: 'Access denied: Not from Tailscale network'
        });
    } catch (error) {
        logger.error('Error in Tailscale authentication middleware:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error during authentication'
        });
    }
}

module.exports = {
    ensureTailscaleAccess,
    isIPInCIDR
};
