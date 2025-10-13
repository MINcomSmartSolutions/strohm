/**
 * @file Service for checking overall user integrity and creating users with proper links to external systems.
 *
 * @module services/user_operations
 * @exports userOperations
 */


const {createOdooUser} = require('./odoo');
const {db} = require('#utils/queries');
const {createSteveUser} = require('./steve_user');
const logger = require('#services/logger');
const {AuthError, ErrorCodes} = require('#utils/errors');
const {validateUser} = require('#utils/joi');
const {GLOBAL_CONFIG} = require("#config");

/**
 * Handles user creation and linking with external systems.
 *
 * - Checks if a user exists by OIDC ID.
 * - If not, creates a new user with a random RFID (for development).
 * - Ensures the user is registered in Odoo and Steve systems.
 * - Returns the up-to-date detailed user object.
 *
 * @async
 * @param {Object} oidc_user - OIDC user info.
 * @returns {Promise<Object>} User object from the database.
 */
const userOperations = async (oidc_user) => {
    let user = await db.getUserUnique({oauth_id: oidc_user.sub});

    if (!user) {
        // Use random RFID for development
        let rfid = Math.random().toString(36).substring(2, 10);
        // const rfid = oidc_user.rfid,

        // FOR DEVELOPMENT ONLY: Assign fixed RFIDs to known test users
        if (!GLOBAL_CONFIG.ENV.IS_PRODUCTION) {
            if (oidc_user.email === "tester@tester2.com") {
                rfid = "4doiy7pg"
            } else if (oidc_user.email === "test@mincom.com") {
                rfid = "ov2x0v02"
            } else if (oidc_user.email === "pontoon.scour_1g@icloud.com") {
                rfid = "n7ok4apd"
            }
        }

        const createdUser = await db.createUser(
            oidc_user.sub,
            oidc_user.name,
            oidc_user.email,
            rfid,
        );

        logger.debug('User is created in DB with email: ' + createdUser.email + ' , OIDC ID: ' + createdUser.oauth_id + ' and RFID: ' + createdUser.rfid);

        await checkANDcreateUserInExternalSystems(createdUser);
        user = await db.getUserUnique({oauth_id: oidc_user.sub});
    } else if (user.deactivated_at !== null) {
        throw new AuthError(ErrorCodes.AUTH.USER_INACTIVE);
    } else {
        await checkANDcreateUserInExternalSystems(user);
        user = await db.getUserUnique({oauth_id: oidc_user.sub});
    }

    // Only fully qualified users are allowed to move further
    //TODO: If this fails show error message to user and end the session (logout)
    validateUser(user); // throws if not valid

    // const has_valid_payment_method = await checkValidPaymentMethod(user);
    // if (!has_valid_payment_method) {
    //     logger.warn('User does not have a valid payment method');
    // }

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


const checkANDcreateUserInExternalSystems = async (user) => {
    if (!user.odoo_user_id) {
        await createOdooUser(user);
    }
    if (!user.steve_id) {
        await createSteveUser(user);
    }
};


module.exports = {
    userOperations,
};