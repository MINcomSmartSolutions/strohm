/**
 * @file Service for checking overall user integrity and creating users with proper links to external systems.
 *
 * @module services/user_operations
 * @exports userOperations
 */


const {createOdooUser, checkValidPaymentMethod} = require('./odoo');
const {db} = require('../utils/queries');
const {createSteveUser} = require('./steve_user');
const logger = require('../services/logger');

/**
 * Handles user creation and linking with external systems.
 *
 * - Checks if a user exists by OIDC ID.
 * - If not, creates a new user with a random RFID (for development).
 * - Ensures the user is registered in Odoo and Steve systems.
 * - Returns the up-to-date user object.
 *
 * @async
 * @param {Object} oidc_user - OIDC user info.
 * @returns {Promise<Object>} User object from the database.
 */
const userOperations = async (oidc_user) => {
    let user = await db.getUserUnique({oauth_id: oidc_user.sub});

    if (!user) {
        // Use random RFID for development
        const rfid = Math.random().toString(36).substring(2, 10);
        // const rfid = oidc_user.rfid,

        const createdUser = await db.createUser(
            oidc_user.sub,
            oidc_user.name,
            oidc_user.email,
            rfid,
        );

        await createOdooUser(createdUser);
        await createSteveUser(createdUser);
        user = await db.getUserUnique({user_id: createdUser.user_id});
    } else if (user && !user.odoo_user_id) {
        // User exists but doesn't have an Odoo ID
        await createOdooUser(user);
        user = await db.getUserUnique({user_id: user.user_id});
    } else if (user && user.odoo_user_id && !user.steve_id) {
        // User exists and has an Odoo ID but not a Steve ID
        await createSteveUser(user);
        user = await db.getUserUnique({user_id: user.user_id});
    }

    const has_valid_payment_method = await checkValidPaymentMethod(user);
    if (!has_valid_payment_method) {
        logger.warn('User does not have a valid payment method');
    }
    return user;


    // TODO: Check for fraud

    //TODO: Check remote and local updated_at date
    // and update the user if needed

    // TODO: Check RFID
    // if (oidc_user.rfid) {
    //     const rfid = await getUserUnique({rfid: oidc_user.rfid});
    //     if (!rfid) {
    //         throw new ValidationError(ErrorCodes.USER.RFID_NOT_FOUND);
    //     }

};


module.exports = {
    userOperations,
};