STEVE_CONFIG = {
    HOST: process.env.STEVE_BASE_URL,
    OCPP_TAGS_URI: '/api/v1/ocppTags',
    TRANSACTIONS_URI: '/api/v1/transactions',
};

//FIXME
ODOO_CONFIG = {
    HOST: process.env.ODOO_HOST,
    API_SECRET: process.env.ODOO_API_SECRET,
    USER_CREATION_URI: '/internal/user/create',
    INVOICE_CREATION_URI: '/internal/bill/create',
    PORTAL_LOGIN_URI: '/portal_login',
    ROTATE_APIKEY_URI: '/internal/rotate_api_key',
};

module.exports = {
    STEVE_CONFIG,
    ODOO_CONFIG,
};