/**
 * @namespace config
 * @description Configuration settings for SteVe and Odoo integrations
 *
 * @property {object} STEVE_CONFIG - Configuration for SteVe server and API endpoints
 * @property {string} STEVE_CONFIG.HOST - SteVe server host
 * @property {string} STEVE_CONFIG.PORT - SteVe server port
 * @property {string} STEVE_CONFIG.URL - SteVe base URL
 * @property {string} STEVE_CONFIG.OCPP_TAGS_URI - OCPP tags API endpoint
 * @property {string} STEVE_CONFIG.TRANSACTIONS_URI - Transactions API endpoint
 *
 * @property {object} ODOO_CONFIG - Configuration for Odoo server and API endpoints
 * @property {string} ODOO_CONFIG.HOST - Odoo server host
 * @property {string} ODOO_CONFIG.PORT - Odoo server port
 * @property {string} ODOO_CONFIG.URL - Odoo base URL
 * @property {string} ODOO_CONFIG.EXTERNAL_HOST - Odoo external host
 * @property {string} ODOO_CONFIG.EXTERNAL_PORT - Odoo external port
 * @property {string} ODOO_CONFIG.EXTERNAL_URL - Odoo external URL
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
    URL: `http://${process.env.STEVE_HOST}:${process.env.STEVE_PORT}/steve`,
    OCPP_TAGS_URI: '/api/v1/ocppTags',
    TRANSACTIONS_URI: '/api/v1/transactions',
};

//FIXME
const ODOO_CONFIG = {
    HOST: process.env.ODOO_HOST,
    PORT: process.env.ODOO_PORT,
    URL: `http://${process.env.ODOO_HOST}:${process.env.ODOO_PORT}`,
    EXTERNAL_HOST: process.env.ODOO_EXTERNAL_HOST,
    EXTERNAL_PORT: process.env.ODOO_EXTERNAL_PORT,
    //TODO: Check EXTERNAL_URL
    EXTERNAL_URL: process.env.NODE_ENV === 'production' ? `https://${process.env.ODOO_EXTERNAL_HOST}` : `http://${process.env.ODOO_EXTERNAL_HOST}:${process.env.ODOO_EXTERNAL_PORT}`,
    API_SECRET: process.env.ODOO_API_SECRET,
    USER_CREATION_URI: '/internal/user/create',
    INVOICE_CREATION_URI: '/internal/bill/create',
    PORTAL_LOGIN_URI: '/portal_login',
    ROTATE_APIKEY_URI: '/internal/rotate_api_key',
    CHECK_PAYMENT_METHOD_URI: '/internal/user/valid_pm',
};

module.exports = {
    STEVE_CONFIG,
    ODOO_CONFIG,
};