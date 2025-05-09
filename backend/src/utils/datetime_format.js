const ISO_EPS_NO_ZONE = 'yyyyMMdd\'T\'HH:mm:ss';

// Define ISO format without timezone (matching SteVe expectation)
const ISO_NO_ZONE = 'yyyy-MM-dd\'T\'HH:mm:ss';

/**
 * Format a Luxon DateTime into SteVe's expected ISO string (no Z)
 * @param {DateTime} dt
 * @returns {string}
 */
function fmt(dt) {
    return dt.toFormat(ISO_NO_ZONE);
}

module.exports = {
    ISO_EPS_NO_ZONE,
    ISO_NO_ZONE,
    fmt,
};