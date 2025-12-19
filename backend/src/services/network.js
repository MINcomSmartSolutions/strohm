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
const {STEVE_CONFIG, ODOO_CONFIG, GLOBAL_CONFIG} = require('#config');
const {SystemError, ErrorCodes} = require("#utils/errors");


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


module.exports = {
    odooAuthedAxios,
    odooPlainAxios,
    steveAxios,
    getSteveHealth,
    checkSteveHealth,
    updateSteveHealth,
};