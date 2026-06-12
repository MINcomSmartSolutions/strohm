/**
 * @file Service for checking overall user integrity and creating users with proper links to external systems.
 *
 * @module services/user_operations
 * @exports userOperations
 */


const {createOdooUser} = require('./odoo');
const {db, normalizeRFID} = require('#utils/queries');
const {createSteveUser} = require('./steve_user');
const logger = require('#services/logger');
const {AuthError, ErrorCodes, ValidationError} = require('#utils/errors');
const {validateUser, oidcUserSchema} = require('#utils/joi');
const {changeRFIDofSteveUser} = require('#services/steve_user');
const {hasStudentAffiliation} = require('#helpers/auth');
const {prettyPrint} = require('#services/logger');

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
        logger.error('OIDC user validation failed: for user' + prettyPrint(oidc_user));
        throw new AuthError(ErrorCodes.AUTH.USER_INVALID, error.message, error);
    }

    let user = await db.getUserUnique({oauth_id: oidc_user.sub});

    if (!user && !createUserIfNotExists) {
        return null;
    }

    if (hasStudentAffiliation(oidc_user)) {
        logger.warn(`User ${oidc_user.sub} (${oidc_user.email}) is student`);
        throw new AuthError(
            ErrorCodes.AUTH.USER_NOT_AUTHORIZED,
            'Sie müssen Mitarbeiter sein, um Ladestationen nutzen zu können. Wenn Sie Mitarbeiter sind, aber diese Meldung erhalten, kontaktieren Sie bitte den Support.',
        );
    }


    if (!user) {
        // New user

        // RFID is already validated with oidcUserSchema
        const rfid = oidc_user.hmMifareSerial;

        const createdUser = await db.createUser(
            oidc_user.sub,
            oidc_user.name,
            oidc_user.email,
            rfid,
        );

        logger.debug('User is created in DB with email: ' + createdUser.email + ' , OIDC ID: ' + createdUser.oauth_id + ' and RFID: ' + createdUser.rfid);

        await createUserInExternalSystems(createdUser);
        user = await db.getUserUnique({oauth_id: oidc_user.sub});
    } else if (user.deactivated_at !== null) {
        throw new AuthError(ErrorCodes.AUTH.USER_INACTIVE);
    } else {
        // User exists
        await createUserInExternalSystems(user);
        await updateRFID(user, oidc_user);
        user = await db.getUserUnique({oauth_id: oidc_user.sub});
    }

    // Only fully qualified users are allowed to move further
    validateUser(user); // throws if not valid

    return user;
};


/**
 * Ensures the given user exists in required external systems.
 *
 * Creates missing links lazily:
 * - Odoo user when `odoo_user_id` is absent
 * - Steve user when `steve_id` is absent
 *
 * @async
 * @param {Object} user - User record from the local database.
 * @param {number} user.user_id - Internal user identifier.
 * @param {?number} [user.odoo_user_id] - Linked Odoo user id, if already created.
 * @param {?string|number} [user.steve_id] - Linked Steve ocpp id, if already created.
 * @returns {Promise<void>}
 */
const createUserInExternalSystems = async (user) => {
    if (!user) {
        logger.error('User object is null or undefined when trying to create links to external systems.');
        throw new ValidationError(ErrorCodes.VALIDATION.INVALID_PARAMETERS, 'User object is required to create links to external systems.');
    }

    logger.info(`Checking external system links for user ID: ${user.user_id}`);
    if (!user.odoo_user_id) {
        await createOdooUser(user);
    }
    if (!user.steve_id) {
        await createSteveUser(user);
    }
};


/**
 * If necessary, updates a user's RFID when OIDC provides a different card serial.
 *
 * Notes:
 * - Throws if required inputs are missing.
 * - Skips updates when the local user has no RFID to compare against.
 * - Uses normalized OIDC RFID for comparison to reduce formatting-only diffs.
 *
 * @async
 * @param {Object} user - User record from the local database.
 * @param {number} user.user_id - Internal user identifier.
 * @param {?string} user.rfid - Current RFID stored for the user.
 * @param {OIDCUser} oidc_user - OIDC profile payload.
 * @returns {Promise<void>}
 */
const updateRFID = async (user, oidc_user) => {
    if (!user || !oidc_user) {
        logger.error('User or OIDC user object is null or undefined when trying to update RFID.');
        throw new ValidationError(ErrorCodes.VALIDATION.INVALID_PARAMETERS, 'Both user and OIDC user objects are required to update RFID.');
    }

    if (!user.rfid) {
        logger.warn(`User ID: ${user.user_id} has no RFID to compare with OIDC data. Skipping RFID update.`);
        return;
    }

    if (oidc_user.hmMifareSerial && normalizeRFID(oidc_user.hmMifareSerial) !== user.rfid) {
        const old_rfid = user.rfid;
        const new_rfid = oidc_user.hmMifareSerial;
        logger.info(`Updating RFID for user ID: ${user.user_id} from ${old_rfid} to ${normalizeRFID(new_rfid)}`);
        await db.updateUser(user.user_id, {rfid: new_rfid});
        try {
            await changeRFIDofSteveUser(user, old_rfid, new_rfid);
        } catch (e) {
            // Rollback DB change if SteVe update fails
            await db.updateUser(user.user_id, {rfid: old_rfid});
            throw e;
        }
    }
};


module.exports = {
    userOperations,
};