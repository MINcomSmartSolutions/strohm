/**
 * @file Middleware for API key authentication between Odoo and the server.
 * Checks the 'x-api-key' header against the configured secret.
 */

// Middleware to verify the API key coming from odoo
// FIXME
const verifyApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.ODOO_API_SECRET) {
        return res.status(403).json({error: 'Unauthorized'});
    }
    next();
};

module.exports = verifyApiKey;
