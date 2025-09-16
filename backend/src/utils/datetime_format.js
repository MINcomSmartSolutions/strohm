/**
 * @file DateTime formatting utilities
 * The overall app uses Luxon for date/time handling.
 * If no time relation information is given with a timezone representation, the time is assumed to be in UTC time.
 * defaultLocale is set to de-DE (Germany) in app.js
 * defaultZoneName is set to 'utc' in app.js
 * Z = Zulu = UTC ~= GMT(+0)
 */


const {DateTime} = require('luxon');
const ISO_NO_ZONE = 'yyyy-MM-dd\'T\'HH:mm:ss';

/**
 * Format a Luxon DateTime into format of ISO_NO_ZONE (e.g. 2025-08-25T14:30:00)
 * @param {DateTime} dt
 * @param toUTC
 * @returns {string}
 */
function fmt(dt, toUTC = true) {
    if (!dt || !dt.isValid) {
        throw new Error('Invalid DateTime object provided');
    }

    const dateTime = toUTC ? dt.toUTC() : dt;
    return dateTime.toFormat(ISO_NO_ZONE);
}

module.exports = {
    ISO_NO_ZONE,
    fmt,
};