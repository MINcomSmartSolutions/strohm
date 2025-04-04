const {getUserUnique} = require('../utils/queries');
const {ValidationError, ErrorCodes} = require('../utils/errors');


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

module.exports = {identifyUser};