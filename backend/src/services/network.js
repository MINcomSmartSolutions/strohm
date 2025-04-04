const getHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.ODOO_ADMIN_API_KEY}`,
});

module.exports = {
    getHeaders,
};