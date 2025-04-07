// Middleware to verify the API key
// FIXME
const verifyApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.ODOO_API_SECRET) {
        return res.status(403).json({error: 'Unauthorized'});
    }
    next();
};

module.exports = verifyApiKey;