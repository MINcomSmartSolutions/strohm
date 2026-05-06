/**
 * @file Admin controller for electricity price and VAT rate management.
 * Protected by Tailscale network authentication.
 *
 * @module controllers/pricing_admin
 */

const {DateTime} = require('luxon');
const logger = require('#services/logger');
const {db} = require('#utils/queries');

/**
 * GET /api/dev/pricing/electricity - List all electricity prices
 */
async function getElectricityPrices(req, res) {
    try {
        const prices = await db.getAllElectricityPrices();
        res.json({success: true, data: prices});
    } catch (error) {
        logger.error('Error fetching electricity prices:', error);
        res.status(500).json({success: false, error: error.message || 'Failed to fetch electricity prices'});
    }
}

/**
 * POST /api/dev/pricing/electricity - Set a new electricity price
 *
 * Body (JSON):
 * - price_eur_kwh: number (required, netto price in EUR/kWh)
 * - valid_from: ISO 8601 datetime string (required)
 */
async function createElectricityPrice(req, res) {
    try {
        const {price_eur_kwh, valid_from} = req.body;

        if (price_eur_kwh === undefined || price_eur_kwh === null || price_eur_kwh === '') {
            return res.status(400).json({success: false, error: 'price_eur_kwh is required'});
        }

        const priceNum = parseFloat(price_eur_kwh);
        if (isNaN(priceNum) || priceNum < 0) {
            return res.status(400).json({success: false, error: 'price_eur_kwh must be a non-negative number'});
        }

        if (!valid_from) {
            return res.status(400).json({success: false, error: 'valid_from is required'});
        }

        const validFromDT = DateTime.fromISO(valid_from, {zone: 'utc'});
        if (!validFromDT.isValid) {
            return res.status(400).json({success: false, error: 'valid_from must be a valid ISO 8601 datetime'});
        }

        const record = await db.setElectricityPrice(priceNum, validFromDT);
        logger.info(`Admin set new electricity price: ${priceNum} EUR/kWh from ${validFromDT.toISO()}`);

        res.json({
            success: true,
            message: `Neuer Strompreis ${priceNum} EUR/kWh ab ${validFromDT.toFormat('dd.MM.yyyy HH:mm')} gesetzt`,
            data: record,
        });
    } catch (error) {
        logger.error('Error setting electricity price:', error);
        res.status(error.statusCode || 500).json({
            success: false,
            error: error.message || 'Failed to set electricity price'
        });
    }
}

/**
 * GET /api/dev/pricing/vat - List all VAT rates
 */
async function getVATRates(req, res) {
    try {
        const rates = await db.getAllVATRates();
        res.json({success: true, data: rates});
    } catch (error) {
        logger.error('Error fetching VAT rates:', error);
        res.status(500).json({success: false, error: error.message || 'Failed to fetch VAT rates'});
    }
}

/**
 * POST /api/dev/pricing/vat - Set a new VAT rate
 *
 * Body (JSON):
 * - rate: integer (required, percentage e.g. 19 for 19%)
 * - description: string (optional)
 * - effective_from: ISO 8601 datetime string (required)
 */
async function createVATRate(req, res) {
    try {
        const {rate, description, effective_from} = req.body;

        if (rate === undefined || rate === null || rate === '') {
            return res.status(400).json({success: false, error: 'rate is required'});
        }

        const rateNum = parseInt(rate, 10);
        if (isNaN(rateNum) || rateNum < 0 || rateNum > 100) {
            return res.status(400).json({success: false, error: 'rate must be an integer between 0 and 100'});
        }

        if (!effective_from) {
            return res.status(400).json({success: false, error: 'effective_from is required'});
        }

        const effectiveFromDT = DateTime.fromISO(effective_from, {zone: 'utc'});
        if (!effectiveFromDT.isValid) {
            return res.status(400).json({success: false, error: 'effective_from must be a valid ISO 8601 datetime'});
        }

        const descStr = description ? String(description).trim() : null;
        if (descStr && descStr.length > 255) {
            return res.status(400).json({success: false, error: 'description must be max 255 characters'});
        }

        const record = await db.setVATRate(rateNum, descStr, effectiveFromDT);
        logger.info(`Admin set new VAT rate: ${rateNum}% from ${effectiveFromDT.toISO()}`);

        res.json({
            success: true,
            message: `Neuer MWSt.-Satz ${rateNum}% ab ${effectiveFromDT.toFormat('dd.MM.yyyy HH:mm')} gesetzt`,
            data: record,
        });
    } catch (error) {
        logger.error('Error setting VAT rate:', error);
        res.status(error.statusCode || 500).json({success: false, error: error.message || 'Failed to set VAT rate'});
    }
}

module.exports = {
    getElectricityPrices,
    createElectricityPrice,
    getVATRates,
    createVATRate,
};
