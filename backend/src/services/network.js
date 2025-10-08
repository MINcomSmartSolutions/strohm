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
        const apiKey = process.env.ODOO_ADMIN_API_KEY;
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
 * An Axios instance for interacting with the Odoo API with authentication.
 *
 * @constant
 * @type {AxiosInstance}
 */
const odooAuthedAxios = createOdooAxios(true);

/**
 * An Axios instance for interacting with the Odoo API without authentication.
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
    const config = {
        baseURL: STEVE_CONFIG.URL,
        headers: {
            'Content-Type': 'application/json',
        },
    };

    if (GLOBAL_CONFIG.ENV.IS_PRODUCTION) {
        const header = process.env.STEVE_API_KEY_HEADER;
        const value = process.env.STEVE_API_KEY;
        if (!header || !value) {
            throw new SystemError(ErrorCodes.VALIDATION.MISSING_REQUIRED_FIELD, 'SteVe API key or header environment variables are not set. Please check your environment configuration.');
        }

        config.headers[process.env.STEVE_API_KEY_HEADER] = process.env.STEVE_API_KEY;
    } else {
        const username = process.env.STEVE_AUTH_USERNAME;
        const password = process.env.STEVE_API_PASSWORD;
        if (!username || !password) {
            throw new SystemError(ErrorCodes.VALIDATION.MISSING_REQUIRED_FIELD, 'SteVe authentication environment variables are not set. Please check your environment configuration.');
        }

        config.auth = {
            username: process.env.STEVE_AUTH_USERNAME,
            password: process.env.STEVE_API_PASSWORD,
        };
    }

    return axios.create(config);
})();

// Test the connection to Steve
steveAxios.get(STEVE_CONFIG.OCPP_TAGS_URI, {
    params: {
        idTag: 'NETWORK_TEST',
    },
})
    .then(response => {
        if (response.status !== 200) {
            logger.error('Error connecting to SteVe: "' + response.status + '" returned. Response: ' + JSON.stringify(response.data));
            throw new Error('Failed to connect to SteVe');
        } else {
            logger.info('Steve connection successful');
        }
    })
    .catch(error => {
        logger.error('Error connecting to SteVe:' + error);
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
};