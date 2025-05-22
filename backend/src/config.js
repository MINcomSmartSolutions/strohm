STEVE_CONFIG = {
    HOST: process.env.STEVE_HOST,
    PORT: process.env.STEVE_PORT,
    URL: `http://${process.env.STEVE_HOST}:${process.env.STEVE_PORT}/steve`,
    OCPP_TAGS_URI: '/api/v1/ocppTags',
    TRANSACTIONS_URI: '/api/v1/transactions',
};

//FIXME
ODOO_CONFIG = {
    HOST: process.env.ODOO_HOST,
    PORT: process.env.ODOO_PORT,
    URL: `http://${process.env.ODOO_HOST}:${process.env.ODOO_PORT}`,
    EXTERNAL_HOST: process.env.ODOO_EXTERNAL_HOST,
    EXTERNAL_PORT: process.env.ODOO_EXTERNAL_PORT,
    EXTERNAL_URL: process.env.NODE_ENV === 'production' ? `https://${process.env.ODOO_EXTERNAL_HOST}` : `http://${process.env.ODOO_EXTERNAL_HOST}:${process.env.ODOO_EXTERNAL_PORT}`,
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