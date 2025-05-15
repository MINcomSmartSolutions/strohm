/**
 * @file DateTime formatting utilities
 */


const {DateTime} = require('luxon');
// Define ISO format without timezone (matching SteVe expectation)
const ISO_NO_ZONE = 'yyyy-MM-dd\'T\'HH:mm:ss';

/**
 * Format a Luxon DateTime into SteVe's expected ISO string (no Z)
 * @param {DateTime} dt
 * @param toUTC
 * @returns {string}
 */
function fmt(dt, toUTC = true) {
    const dateTime = toUTC ? dt.toUTC() : dt;
    return dateTime.toFormat(ISO_NO_ZONE);
}

module.exports = {
    ISO_NO_ZONE,
    fmt,
};