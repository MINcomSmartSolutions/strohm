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
const {validateUser, oidcUserSchema} = require('#utils/joi');
const {GLOBAL_CONFIG} = require("#config");
const {getRFIDFromFile} = require("#helpers/user");

/**
 * Handles user creation and linking with external systems.
 *
 * - Checks if a user exists by OIDC ID.
 * - If not, and createUserIfNotExists is true creates a new user with the users' rfid.
 * - If not, and createUserIfNotExists is false, returns null.
 * - If user exists but is deactivated, throws an error.
 * - If user exists, checks for updates in OIDC data and updates the user if needed.
 * - Ensures the user is registered in Odoo and Steve systems.
 * - Returns the up-to-date detailed user object.
 *
 * @async
 * @param {OIDCUser} oidc_user - OIDC user info.
 * @param {boolean} [createUserIfNotExists=true] - Whether to create a new user if not found.
 * @returns {Promise<Object>} User object from the database.
 */
const userOperations = async (oidc_user, createUserIfNotExists = true) => {
    const {error} = oidcUserSchema.validate(oidc_user);
    if (error) {
        throw new AuthError(ErrorCodes.AUTH.USER_INVALID, error.message, error);
    }

    let user = await db.getUserUnique({oauth_id: oidc_user.sub});

    if (!user && !createUserIfNotExists) {
        return null;
    }

    if (!user) {
        // New user
        let rfid = null;
        if (GLOBAL_CONFIG.ENV.IS_PRODUCTION) {
            const file_rfid = await getRFIDFromFile(oidc_user.email); // Primary check: read from RFID file
            if (file_rfid) {
                rfid = file_rfid;
            } else if (oidc_user.hmMifareSerial) {
                // Fallback: use hmMifareSerial if file lookup fails
                rfid = oidc_user.hmMifareSerial;
            } else {
                logger.error('RFID couldnt be found neither in file mapping nor in OIDC for email: ' + oidc_user.email);
                throw new AuthError(ErrorCodes.AUTH.RFID_NOT_FOUND);
            }
        } else {
            rfid = 'DEV-' + Math.random().toString(36).substring(2, 10).toUpperCase();
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
        //TODO: needs testing!!!

        // Check if OIDC data has changed (normalize RFIDs for comparison)
        // const needsUpdate =
        //     user.name !== oidc_user.name ||
        //     user.email !== oidc_user.email ||
        //     (oidc_user.hmMifareSerial && (normalizeRFID(user.rfid) !== normalizeRFID(oidc_user.hmMifareSerial)));
        //
        // if (needsUpdate) {
        //     const updated_user = await db.updateUser(user.user_id, {
        //         name: oidc_user.name,
        //         email: oidc_user.email,
        //         // Only update RFID if provided and different
        //         ...(oidc_user.hmMifareSerial && {rfid: oidc_user.hmMifareSerial})
        //     });
        //
        //     const now = DateTime.utc();
        //     await blockSteveUser(updated_user, "RFID is stale. Should not be activated.", now);
        //
        //     const new_create_user = await createSteveUser(updated_user, false, `New active RFID of old OCPP TAG PK: ${updated_user.steve_id}`); // Create new Steve user with updated RFID
        //     if (!new_create_user) {
        //         logger.error("Failed to create new Steve user after RFID change for user ID: " + updated_user.user_id);
        //     }
        // }

        await checkANDcreateUserInExternalSystems(user);
        user = await db.getUserUnique({oauth_id: oidc_user.sub});
    }

    // Only fully qualified users are allowed to move further
    validateUser(user); // throws if not valid

    return user;
};


const checkANDcreateUserInExternalSystems = async (user) => {
    logger.info(`Checking external system links for user ID: ${user.user_id}`);
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