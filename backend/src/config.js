// noinspection HttpUrlsUsage

/**
 * @namespace config
 * @description Configuration settings for SteVe and Odoo integrations
 *
 * @property {object} STEVE_CONFIG - Configuration for SteVe server and API endpoints
 * @property {string} STEVE_CONFIG.URL - External STEVE_BASE_URL env
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
 * @property {string} ODOO_CONFIG.TXN_PROCESS_URI - Invoice creation endpoint
 * @property {string} ODOO_CONFIG.PORTAL_LOGIN_URI - Portal login endpoint
 * @property {string} ODOO_CONFIG.ROTATE_APIKEY_URI - API key rotation endpoint
 */
const STEVE_CONFIG = {
    URL: process.env.STEVE_BASE_URL,
    OCPP_TAGS_URI: '/api/v1/ocppTags',
    TRANSACTIONS_URI: '/api/v1/transactions',
    HTTP_AUTH_USERNAME: process.env.STEVE_AUTH_USERNAME,
    HTTP_AUTH_PASSWORD: process.env.STEVE_API_PASSWORD,
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
    TXN_PROCESS_URI: '/internal/txn/process',
    PORTAL_LOGIN_URI: '/portal_login',
    ROTATE_APIKEY_URI: '/internal/rotate_api_key',
};

const nodeEnv = (process.env.NODE_ENV || 'dev').toLowerCase();
const GLOBAL_CONFIG = {
    ENV: {
        IS_PRODUCTION: nodeEnv === 'production' || nodeEnv === 'prod',
        IS_DEVELOPMENT: nodeEnv === 'development' || nodeEnv === 'dev' && !this.IS_PRODUCTION,
        IS_TEST: nodeEnv === 'test',
    },
    OIDC: {
        DISCOVERY_CACHE_TTL: 24 * 60 * 60 * 1000, // 24 hours - configurable TTL for OIDC discovery cache
    },
    TAILSCALE: {
        // Enable admin panel access from Tailscale network
        ENABLE_ADMIN: process.env.TAILSCALE_ENABLE_ADMIN === 'true',
        // Tailscale CGNAT IP range: 100.64.0.0/10
        // You can also use your specific Tailnet range from tailscale status
        // No default - must be explicitly configured
        ALLOWED_RANGES: process.env.TAILSCALE_ALLOWED_RANGES
            ? process.env.TAILSCALE_ALLOWED_RANGES.split(',').map(r => r.trim())
            : [],
        // Specific IPs to allow (comma-separated in env var)
        ALLOWED_IPS: process.env.TAILSCALE_ALLOWED_IPS
            ? process.env.TAILSCALE_ALLOWED_IPS.split(',').map(ip => ip.trim())
            : [],
    },
    MAX_RFID_LENGTH: 36,
    DEFAULT_ELECTRICITY_PRICE_EUR_PER_KWH_NETTO: process.env.DEFAULT_ELECTRICITY_PRICE_EUR_PER_KWH_NETTO || 0.30,
}

module.exports = {
    STEVE_CONFIG,
    ODOO_CONFIG,
    GLOBAL_CONFIG,
};