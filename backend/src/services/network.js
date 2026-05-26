/**
 * @file Network service module for external API clients.
 *
 * - Exports pre-configured Axios instances for Odoo and SteVe APIs.
 * - Tests connections to SteVe and Odoo on module load.
 *
 * @module services/network
 */
const axios = require('axios');
const logger = require('./logger');
const {STEVE_CONFIG, ODOO_CONFIG} = require('#config');
const {SystemError, ErrorCodes} = require("#utils/errors");
const {isIP} = require("node:net");


// Track SteVe health status
let steveHealthStatus = {
    isHealthy: false,
    lastCheck: null,
    lastError: null,
};

/**
 * Get SteVe health status
 * @returns {{isHealthy: boolean, lastCheck: Date|null, lastError: string|null}}
 */
function getSteveHealth() {
    return {...steveHealthStatus};
}

/**
 * Update SteVe health status
 * @param {boolean} isHealthy
 * @param {string|null} error
 */
function updateSteveHealth(isHealthy, error = null) {
    steveHealthStatus = {
        isHealthy,
        lastCheck: new Date(),
        lastError: error,
    };
    STEVE_CONFIG.IS_HEALTHY = isHealthy;

    if (isHealthy) {
        logger.info('SteVe health status: HEALTHY');
    } else {
        logger.warn(`SteVe health status: UNHEALTHY - ${error || 'Unknown error'}`);
    }
}

/**
 * Check SteVe connection health
 * @returns {Promise<boolean>}
 */
async function checkSteveHealth() {
    try {
        const response = await steveAxios.get(STEVE_CONFIG.OCPP_TAGS_URI, {
            params: {idTag: 'HEALTH_CHECK'},
            timeout: 5000,
        });

        const contentType = response.headers['content-type'] || '';
        const isJson = contentType.includes('application/json');

        if (response.status !== 200) {
            updateSteveHealth(false, `HTTP ${response.status}`);
            return false;
        } else if (!isJson) {
            updateSteveHealth(false, `Non-JSON response (${contentType})`);
            return false;
        } else {
            updateSteveHealth(true);
            return true;
        }
    } catch (error) {
        updateSteveHealth(false, error.message);
        return false;
    }
}

/**
 * Creates a pre-configured Axios instance for interacting with the Odoo API.
 *
 * @function
 * @param {boolean} [includeAuth=true] - Determines whether to include authentication header.
 * @returns {AxiosInstance} A configured Axios instance for Odoo API requests.
 * @throws {SystemError} If `includeAuth` is true and the Odoo admin API key is not set in the environment variables.
 */
function createOdooAxios(includeAuth = true) {
    const headers = {
        'Content-Type': 'application/json',
    };

    if (includeAuth) {
        const apiKey = process.env.ODOO_ADMIN_API_KEY || process.env.ODOO_API_SECRET;
        if (!apiKey) {
            throw new SystemError(
                ErrorCodes.VALIDATION.MISSING_REQUIRED_FIELD,
                'Odoo admin API key environment variable is not set. Please check your environment configuration.'
            );
        }
        headers['Authorization'] = `Bearer ${apiKey}`;
    }

    return axios.create({
        baseURL: ODOO_CONFIG.INTERNAL_BASE_URL,
        headers,
        validateStatus: () => true, // Allows all HTTP status codes to pass validation.
    });
}

/**
 * An Axios instance for interacting with the Odoo API with authentication with internal docker network.
 *
 * @constant
 * @type {AxiosInstance}
 */
const odooAuthedAxios = createOdooAxios(true);

/**
 * An Axios instance for interacting with the Odoo API without authentication with internal docker network.
 *
 * @constant
 * @type {AxiosInstance}
 */
const odooPlainAxios = createOdooAxios(false);


/**
 * Creates a pre-configured Axios instance for interacting with the SteVe API.
 *
 * The configuration depends on the environment:
 * - In production, it uses an API key for authentication, which is passed as a custom header.
 * - In non-production environments, it uses basic authentication with a username and password.
 *
 * @throws {SystemError} If required environment variables for authentication are not set.
 */
const steveAxios = (() => {
    const username = STEVE_CONFIG.HTTP_AUTH_USERNAME;
    const password = STEVE_CONFIG.HTTP_AUTH_PASSWORD;

    const config = {
        baseURL: STEVE_CONFIG.URL,
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        auth: {
            username: username,
            password: password,
        }
    };

    return axios.create(config);
})();

// Test the connection to Steve
steveAxios.get(STEVE_CONFIG.OCPP_TAGS_URI, {
    params: {
        idTag: 'NETWORK_TEST',
    },
})
    .then(response => {
        const contentType = response.headers['content-type'] || '';
        const isJson = contentType.includes('application/json');

        if (response.status !== 200) {
            logger.error('Error connecting to SteVe: "' + response.status + '" returned. Response: ' + JSON.stringify(response.data));
            updateSteveHealth(false, `HTTP ${response.status}`);
            throw new Error('Failed to connect to SteVe');
        } else if (!isJson) {
            logger.error('Error connecting to SteVe: Expected JSON response but got "' + contentType + '". This usually indicates wrong endpoint or authentication failure.');
            updateSteveHealth(false, `Non-JSON response (${contentType})`);
            throw new Error('Failed to connect to SteVe - received non-JSON response');
        } else {
            logger.info('Steve connection successful');
            updateSteveHealth(true);
        }
    })
    .catch(error => {
        logger.error('Error connecting to SteVe');
        updateSteveHealth(false, error.message);
    });

// Test the connection to Odoo
odooAuthedAxios.get('/internal/admin/connection-check')
    .then(response => {
        if (response.status !== 200) {
            logger.error(`Error connecting to Odoo: "${response.status} returned. Response: ${JSON.stringify(response.data)}"`);
            throw new Error('Failed to connect to Odoo');
        } else {
            logger.info('Odoo connection successful');
        }
    })
    .catch(error => {
        logger.error(`Error connecting to Odoo:"${error.message}"`);
    });


/**
 * Helper function to send a standardized unsuccessful response.
 * @param {object} res
 * @param {number} statusCode
 * @param {object|null} responseData Optional additional data to include in the response
 * @returns {*}
 */
function unsuccessfulResponse(res, statusCode, responseData = null) {
    if (responseData) {
        return res.status(statusCode).json({
            success: false,
            responseData,
        });
    }

    return res.status(statusCode).json({
        success: false,
    });
}


/**
 * Helper function to extract the client's IP address from the request
 * @param req
 * @param ensureProxyHeaders
 * @returns {string|null}
 */
function getIP(req, ensureProxyHeaders = true) {
    // Any of the following headers may contain the client's real IP address, depending on the proxy setup.
    // And they can also be tampered with by the client if the server port is reachable directly! nginx conf ensures they can not be spoofed

    let forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        const trimmed = forwarded.split(',')[0].trim(); // Get the first IP in the list (the original client IP)
        const isForwardedIPValid = isIP(trimmed) !== 0;
        if (isForwardedIPValid && !ensureProxyHeaders) {
            return cleanIPV6MappedIPv4(trimmed);
        }
    }

    let realIP = req.headers['x-real-ip']; // nginx sets this, so it should be present in production behind nginx
    if (realIP) {
        const isRealIPValid = isIP(realIP) !== 0;
        if (isRealIPValid) {
            return cleanIPV6MappedIPv4(realIP);
        }
    }

    return null;
}


function cleanIPV6MappedIPv4(ip) {
    if (ip.startsWith('::ffff:')) {
        return ip.substring(7);
    }
    return ip;
}

/**
 * Check if an IP address is within a CIDR range
 * @param {string} ip - IP address to check
 * @param {string} cidr - CIDR range (e.g., '100.64.0.0/10')
 * @returns {boolean}
 */
function isIPInCIDR(ip, cidr) {
    if (!ip || !cidr) return false;
    if (isIP(ip) === 0) return false; // Not an IP address

    const [range, bits] = cidr.split('/');
    const mask = ~(2 ** (32 - parseInt(bits)) - 1);

    const ipNum = ip.split('.').reduce((num, octet) => (num << 8) + parseInt(octet), 0) >>> 0;
    const rangeNum = range.split('.').reduce((num, octet) => (num << 8) + parseInt(octet), 0) >>> 0;

    return (ipNum & mask) === (rangeNum & mask);
}

// Helper: detect private/local IPv4 (RFC1918 + loopback) for development convenience
function isPrivateDevIP(ip) {
    if (!ip) return false;
    const ip_cat = isIP(ip)
    if (ip_cat === 0) return false; // Not an IP address

    let normalizedIp = ip;

    // Normalize IPv6-mapped IPv4
    if (ip.startsWith('::ffff:')) normalizedIp = ip.substring(7);
    if (normalizedIp === '127.0.0.1' || normalizedIp === '::1') return true;
    const parts = normalizedIp.split('.');
    if (parts.length !== 4) return false;
    const [a, b] = parts.map(p => parseInt(p, 10));
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (covers docker default 172.17.x.x)
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    return false;
}

module.exports = {
    odooAuthedAxios,
    odooPlainAxios,
    steveAxios,
    getSteveHealth,
    checkSteveHealth,
    updateSteveHealth,
    unsuccessfulResponse,
    getIP,
    isIPInCIDR,
    isPrivateDevIP,
};