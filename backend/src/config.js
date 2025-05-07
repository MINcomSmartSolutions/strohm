STEVE_CONFIG = {
    OCPP_TAGS_URL: '/api/v1/ocppTags',
    TRANSACTIONS_URL: '/api/v1/transactions',
};

//FIXME
ODOO_CONFIG = {
    ODOO_HOST: process.env.ODOO_HOST,
    ODOO_ADMIN_API_KEY: process.env.ODOO_ADMIN_API_KEY,
};

module.exports = {
    STEVE_CONFIG,
    ODOO_CONFIG,
};