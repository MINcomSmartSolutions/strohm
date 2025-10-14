// noinspection HttpUrlsUsage

/**
 * @namespace config
 * @description Configuration settings for SteVe and Odoo integrations
 *
 * @property {object} STEVE_CONFIG - Configuration for SteVe server and API endpoints
 * @property {string} STEVE_CONFIG.HOST - SteVe server host
 * @property {string} STEVE_CONFIG.PORT - SteVe server port
 * @property {string} STEVE_CONFIG.URL - External STEVE_BASE_URL env if not, internal url created from .HOST and .PORT accesing through docker network
 * @property {string} STEVE_CONFIG.OCPP_TAGS_URI - OCPP tags API endpoint
 * @property {string} STEVE_CONFIG.TRANSACTIONS_URI - Transactions API endpoint
 *
 * @property {object} ODOO_CONFIG - Configuration for Odoo server and API endpoints
 * @property {string} ODOO_CONFIG.HOST - Odoo server host
 * @property {string} ODOO_CONFIG.PORT - Odoo server port (usually 8069)
 * @property {string} ODOO_CONFIG.INTERNAL_BASE_URL - Internal URL accesing through docker network, created from .HOST and .PORT
 * @property {string} ODOO_CONFIG.EXTERNAL_BASE_URL - Odoo external URL
 * @property {string} ODOO_CONFIG.API_SECRET - Odoo API secret
 * @property {string} ODOO_CONFIG.USER_CREATION_URI - User creation endpoint
 * @property {string} ODOO_CONFIG.INVOICE_CREATION_URI - Invoice creation endpoint
 * @property {string} ODOO_CONFIG.PORTAL_LOGIN_URI - Portal login endpoint
 * @property {string} ODOO_CONFIG.ROTATE_APIKEY_URI - API key rotation endpoint
 * @property {string} ODOO_CONFIG.CHECK_PAYMENT_METHOD_URI - Payment method check endpoint
 */
const STEVE_CONFIG = {
    HOST: process.env.STEVE_HOST,
    PORT: process.env.STEVE_PORT,
    URL: process.env.STEVE_BASE_URL || `http://${process.env.STEVE_HOST}:${process.env.STEVE_PORT}/steve`,
    OCPP_TAGS_URI: '/api/v1/ocppTags',
    TRANSACTIONS_URI: '/api/v1/transactions',
    // Dynamic
    IS_HEALTHY: false,
};

const ODOO_CONFIG = {
    HOST: process.env.ODOO_HOST,
    PORT: process.env.ODOO_PORT || 8069,
    INTERNAL_BASE_URL: `http://${process.env.ODOO_HOST}:${process.env.ODOO_PORT}`,
    EXTERNAL_BASE_URL: process.env.ODOO_EXTERNAL_BASE_URL,
    API_SECRET: process.env.ODOO_API_SECRET,
    USER_CREATION_URI: '/internal/user/create',
    INVOICE_CREATION_URI: '/internal/bill/create',
    PORTAL_LOGIN_URI: '/portal_login',
    ROTATE_APIKEY_URI: '/internal/rotate_api_key',
    CHECK_PAYMENT_METHOD_URI: '/internal/user/valid_pm',
};

const nodeEnv = (process.env.NODE_ENV || 'dev').toLowerCase();
const GLOBAL_CONFIG = {
    ENV: {
        IS_PRODUCTION: nodeEnv === 'production' || nodeEnv === 'prod',
        IS_DEVELOPMENT: nodeEnv === 'development' || nodeEnv === 'dev' && !this.IS_PRODUCTION,
        IS_TEST: nodeEnv === 'test',
    }
}

module.exports = {
    STEVE_CONFIG,
    ODOO_CONFIG,
    GLOBAL_CONFIG,
};