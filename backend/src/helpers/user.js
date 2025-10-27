/*
 * Helper functions for user management
 * Not used at the moment but could be useful in the future
 */

const {getUserUnique} = require('#utils/queries');
const {ValidationError, ErrorCodes} = require('#utils/errors');
const logger = require('#services/logger');

/**
 * Gets a user by either user_id or oauth_id
 *
 * @param {number|string} identifier - Either user_id or oauth_id
 * @param {Object} options - Additional options
 * @param {boolean} options.requireOdooUser - If true, verify user has an Odoo ID
 * @returns {Promise<Object>} - User object
 * @throws {ValidationError} - If user not found or doesn't meet requirements
 */
const identifyUser = async (identifier, options = {}) => {
    let user;

    if (typeof identifier === 'number' || !isNaN(parseInt(identifier))) {
        user = await getUserUnique({user_id: parseInt(identifier)});
    } else {
        user = await getUserUnique({oauth_id: identifier});
    }

    if (!user) {
        throw new ValidationError(ErrorCodes.USER.NOT_FOUND);
    }

    if (options.requireOdooUser && !user.odoo_user_id) {
        throw new ValidationError(ErrorCodes.USER.ODOO_NOT_FOUND);
    }

    return user;
};


async function getRFIDFromFile(email) {
    const fs = require('node:fs');
    const path = require('path');
    try {
        const csv_path = path.join(__dirname, '../../rfid_mapping.csv');
        const data = fs.readFileSync(csv_path, 'utf8');
        const lines = data.trim().split('\n');
        for (const line of lines) {
            const [lineEmail, rfid] = line.split(',').map(item => item.trim());
            if (lineEmail === email) {
                return rfid;
            }
        }
        return null;
    } catch (e) {
        logger.error('Error reading RFID mapping file:', e);
        return null;
    }
}

module.exports = {identifyUser, getRFIDFromFile};