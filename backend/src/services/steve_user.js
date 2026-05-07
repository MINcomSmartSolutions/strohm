/**
 * @file SteVe User Service
 *
 * Provides functions to create, fetch, block, and unblock users in the SteVe OCPP backend.
 * - createSteveUser: Creates a new user in SteVe with the given RFID.
 * - getSteveUser: Fetches a user from SteVe by RFID.
 * - blockSteveUser: Blocks a user in SteVe (sets maxActiveTransactionCount to 0).
 * - unblockSteveUser: Unblocks a user in SteVe (sets maxActiveTransactionCount to 1).
 *
 * All functions validate input and handle errors using custom error types.
 *
 * @module services/steve_user
 */
const {ValidationError, ErrorCodes, SystemError} = require('#utils/errors');
const {steveAxios} = require('./network');
const {validateSteveUser} = require('#utils/steve');
const logger = require('./logger');
const {db} = require('#utils/queries');
const {STEVE_CONFIG, GLOBAL_CONFIG} = require('#config');
const {DateTime} = require("luxon");
//TODO: Check everything even the response returned 200 or 201


const validateUserObjectForSteve = (user) => {
    if (!user || !user.rfid || user.rfid.trim() === '' || user.rfid.length > GLOBAL_CONFIG.MAX_RFID_LENGTH) {
        throw new ValidationError(ErrorCodes.VALIDATION.INVALID_PARAMETERS);
    }
}


/**
 * Creates a new user in SteVe with the given RFID.
 * - If the user already exists in SteVe, records a FIND USER activity and saves the `ocppTagPk` to the local DB.
 * - If the user does not exist, creates it with the specified block status, validates the response,
 *   stores the returned `ocppTagPk` in the local DB and returns the created SteVe user data.
 * - Side effects: updates DB via `db.setSteveUserParamaters` and records activity logs.
 *
 * @async
 * @param {Object} user - The user object (must include `rfid` and may include `user_id`).
 * @param {boolean} [blocked=false] - Whether the user should be created as blocked.
 * @param {string|null} [reason=null] - Optional note for the user.
 * @param {boolean} [failIfExists=false] - If true, throws an error if the user already exists in SteVe.
 * @returns {Promise<Object|null>} Resolves to the created SteVe user object when a new user was created; resolves to `null` if the user already existed (no new creation).
 * @throws {ValidationError|SystemError|Error} If validation fails, SteVe returns an error or no response, or other failures occur.
 */
const createSteveUser = async (user, blocked = false, reason = null, failIfExists = false) => {
    validateUserObjectForSteve(user);

    if (!STEVE_CONFIG.IS_HEALTHY) {
        throw new SystemError(ErrorCodes.STEVE.UNHEALTHY);
    }

    let ocppTagPk = null;
    let steveUser = null;

    logger.info(`Creating user in Steve with RFID: ${user.rfid}`);

    // Check if the user already exists in SteVe
    const user_query = await getSteveUser(user.rfid);
    if (user_query) {
        if (failIfExists) {
            throw new SystemError(ErrorCodes.STEVE.USER_EXISTS);
        }
        // Already exists,take the existing ocppTagPk
        logger.info(`User with RFID ${user.rfid} already exists in SteVe`);
        ocppTagPk = user_query.ocppTagPk;

        logger.info(`User already exists in SteVe. Recording findings.`);
        await db.recordActivityLog(user.user_id, 'FIND USER', 'SteVe', user.rfid, reason);

        if (user_query.blocked !== blocked) {
            logger.warn(`User with RFID ${user.rfid} block status mismatch. Expected blocked=${blocked}, found blocked=${user_query.blocked}`);
        }
    } else {
        const create_response = await steveAxios.post(STEVE_CONFIG.OCPP_TAGS_URI, {
            idTag: user.rfid,
            maxActiveTransactionCount: blocked ? 0 : 1,
            note: reason ? reason : 'RFID created with API by MINcom Smart Solutions GmbH',
        });

        if (!create_response) {
            throw new SystemError(ErrorCodes.STEVE.NO_RESPONSE, 'No response from SteVe while creating user');
        }
        if (create_response.status !== 201) {
            throw new SystemError(ErrorCodes.STEVE.USER_CREATE_FAILED, `Failed to create user in SteVe: ${create_response.statusText}`);
        }

        // Validate the response, ensuring it contains the expected fields and values. Any discrepancies will throw an error.
        validateSteveUser(create_response.data, user.rfid);
        ocppTagPk = create_response.data.ocppTagPk;

        // Check if the user is returned when queried
        const create_check_query = await getSteveUser(user.rfid);
        if (!create_check_query) {
            throw new SystemError(ErrorCodes.STEVE.USER_NOT_FOUND, `User with RFID ${user.rfid} not found after creation in SteVe`);
        }
        steveUser = create_check_query;

        logger.debug('User created in SteVe with RFID: ' + user.rfid + ' and steve_id: ' + create_check_query.ocppTagPk);

        await db.recordActivityLog(user.user_id, 'CREATE USER', 'SteVe', user.rfid, reason);
        if (blocked) {
            await db.recordActivityLog(user.user_id, 'BLOCK USER', 'SteVe', user.rfid, 'User is created as blocked');
        }
    }

    await db.setSteveUserParamaters(user, ocppTagPk);

    return steveUser;
};


/**
 * Fetches a user from SteVe by RFID.
 * Returns null if not found, throws if multiple found or on error.
 * Validates the user data.
 *
 * @param {string} user_rfid - The user's RFID.
 * @returns {Promise<steve_user|null>} User data array or null if not found.
 * @throws {ValidationError|Error} On invalid input or fetch error.
 */
const getSteveUser = async (user_rfid) => {
    if (!user_rfid || user_rfid.trim() === '') {
        // Never fetch all ocppTags
        throw new ValidationError(ErrorCodes.VALIDATION.INVALID_PARAMETERS);
    }

    if (!STEVE_CONFIG.IS_HEALTHY) {
        throw new SystemError(ErrorCodes.STEVE.UNHEALTHY);
    }

    const response = await steveAxios.get(STEVE_CONFIG.OCPP_TAGS_URI, {
        params: {
            idTag: user_rfid,
        },
    });

    if (!response) {
        throw new SystemError(ErrorCodes.STEVE.NO_RESPONSE, 'No response from SteVe while fetching user');
    }
    if (response.status !== 200) {
        throw new SystemError(ErrorCodes.STEVE.USER_GET_FAILED, `Failed to fetch user from SteVe: ${response.statusText}`);
    }
    if (response.data.length === 0) {
        return null; // User not found
    }
    if (response.data.length > 1) {
        throw new SystemError(ErrorCodes.STEVE.USER_MULTIPLE_FOUND);
    }

    validateSteveUser(response.data[0], user_rfid); // Throws if invalid

    return response.data[0];
};


/**
 * Blocks a user in SteVe by setting their maxActiveTransactionCount to 0.
 * Validates input, updates the user, checks the block status, and logs the action.
 *
 * @async
 * @param {Object} user - The user object (must include rfid and steve_id).
 * @param {string|null} [reason=null] - Optional reason for blocking.
 * @param {Object} [expiredDate=null] - Optional expiration date to set for the user. Luxon DateTime object.
 * @returns {Promise<void>}
 * @throws {ValidationError|Error} If input is invalid or block fails.
 */
const blockSteveUser = async (user, reason = null, expiredDate = null) => {
    validateUserObjectForSteve(user);
    if (expiredDate && !expiredDate.isValid) {
        throw new ValidationError(ErrorCodes.VALIDATION.INVALID_PARAMETERS, 'Invalid expiredDate provided');
    }

    if (!STEVE_CONFIG.IS_HEALTHY) {
        throw new SystemError(ErrorCodes.STEVE.UNHEALTHY);
    }

    const response = await steveAxios.put(STEVE_CONFIG.OCPP_TAGS_URI + `/${user.steve_id}`, {
        idTag: user.rfid,
        maxActiveTransactionCount: 0,
        note: reason ? reason : 'User blocked with API by MINcom Smart Solutions GmbH',
        expiredAt: expiredDate ? expiredDate.toLocaleString() : null,
    });

    if (!response) {
        throw new SystemError(ErrorCodes.STEVE.NO_RESPONSE, 'No response from SteVe while blocking user');
    }
    if (response.status !== 200) {
        throw new SystemError(ErrorCodes.STEVE.USER_BLOCK_FAILED, `Failed to block user in SteVe: ${response.statusText}`);
    }
    // Check if the user is blocked
    if (response.data.maxActiveTransactionCount !== 0 || response.data.blocked !== true) {
        throw new SystemError(ErrorCodes.STEVE.USER_BLOCK_FAILED, `User with RFID ${user.rfid} could not be blocked in SteVe`);
    }

    await db.recordActivityLog(user.user_id, 'BLOCK USER', 'SteVe', user.rfid, reason);
};


/**
 * Unblocks a user in SteVe by setting their maxActiveTransactionCount to 1.
 * Validates input, updates the user, checks the unblock status, and logs the action.
 *
 * @async
 * @param {Object} user - The user object (must include rfid and steve_id).
 * @param reason - Optional reason for unblocking.
 * @returns {Promise<void>}
 * @throws {ValidationError|Error} If input is invalid or unblock fails.
 */
const unblockSteveUser = async (user, reason = null) => {
    validateUserObjectForSteve(user);

    if (!STEVE_CONFIG.IS_HEALTHY) {
        throw new SystemError(ErrorCodes.STEVE.UNHEALTHY);
    }

    // Check if its already unblocked
    const existing_user = await getSteveUser(user.rfid);
    if (existing_user && existing_user.maxActiveTransactionCount === 1 && existing_user.blocked === false) {
        logger.info(`User with RFID ${user.rfid} is already unblocked in SteVe`);
        return;
    }

    const response = await steveAxios.put(STEVE_CONFIG.OCPP_TAGS_URI + `/${user.steve_id}`, {
        idTag: user.rfid,
        maxActiveTransactionCount: 1,
        // Maybe also add a note of the reason for blocking
    });

    if (!response) {
        throw new SystemError(ErrorCodes.STEVE.NO_RESPONSE, 'No response from SteVe while unblocking user');
    }
    if (response.status !== 200) {
        throw new SystemError(ErrorCodes.STEVE.USER_UNBLOCK_FAILED, `Failed to unblock user in SteVe: ${response.statusText}`);
    }
    // Check if the user is unblocked
    if (response.data.maxActiveTransactionCount !== 1 || response.data.blocked !== false) {
        throw new SystemError(ErrorCodes.STEVE.USER_UNBLOCK_FAILED, `User with RFID ${user.rfid} could not be unblocked in SteVe`);
    }

    await db.recordActivityLog(user.user_id, 'UNBLOCK USER', 'SteVe', user.rfid, reason);
};


/**
 * Deletes a user from SteVe by their steve_id.
 * Validates input, deletes the user, and logs the action.
 *
 * @async
 * @param {Object} user - The user object (must include rfid and steve_id).
 * @returns {Promise<void>}
 * @throws {ValidationError|Error} If input is invalid or deletion fails.
 */
const deleteSteveUser = async (user) => {
    validateUserObjectForSteve(user);

    if (!STEVE_CONFIG.IS_HEALTHY) {
        throw new SystemError(ErrorCodes.STEVE.UNHEALTHY);
    }

    logger.info(`Deleting user from SteVe with RFID: ${user.rfid} and steve_id: ${user.steve_id}`);

    const response = await steveAxios.delete(STEVE_CONFIG.OCPP_TAGS_URI + `/${user.steve_id}`);

    if (!response) {
        throw new SystemError(ErrorCodes.STEVE.NO_RESPONSE, 'No response from SteVe while deleting user');
    }
    if (response.status !== 200 && response.status !== 204) {
        throw new SystemError(ErrorCodes.STEVE.USER_DELETE_FAILED, `Failed to delete user from SteVe: ${response.statusText}`);
    }

    // Verify the user is deleted
    const checkQuery = await getSteveUser(user.rfid);
    if (checkQuery) {
        throw new SystemError(ErrorCodes.STEVE.USER_DELETE_FAILED, `User with RFID ${user.rfid} still exists after deletion attempt`);
    }

    logger.debug('User deleted from SteVe with RFID: ' + user.rfid);
    await db.recordActivityLog(user.user_id, 'DELETE USER', 'SteVe', user.rfid);
};


/**
 * Changes the RFID of an existing SteVe user.
 * Should run after the RFID is changed in the local DB.
 * @async
 * @param {Object} user - The user object (must include new `rfid` and may include `user_id`).
 * @param {string} old_rfid - The old RFID of the user to be changed.
 */
async function changeRFIDofSteveUser(user, old_rfid) {
    validateUserObjectForSteve(user);

    if (!STEVE_CONFIG.IS_HEALTHY) {
        throw new SystemError(ErrorCodes.STEVE.UNHEALTHY);
    }
    const new_rfid = user.rfid;
    const existing_user = await getSteveUser(old_rfid);
    if (!existing_user) {
        throw new SystemError(ErrorCodes.STEVE.USER_NOT_FOUND, `User with RFID ${old_rfid} not found in SteVe for RFID change`);
    }

    // Create a user object with the old RFID for blocking
    const user_with_old_rfid = {...user, rfid: old_rfid};
    await blockSteveUser(user_with_old_rfid, `Blocked in favor of ${new_rfid}`, DateTime.now());

    try {
        //
        // CAUTION!!!
        //
        // If failIfExists is not set and new RFID matches someone else's RFID, it will replace the existing user with someone else's RFID.
        await createSteveUser(user, user.deactivated_at, `Created as replacement for ${old_rfid}`, true);
    } catch (error) {
        // Rollback: unblock the old RFID if creating the new one failed
        logger.error(`Failed to create new RFID ${new_rfid}, rolling back block on ${old_rfid}`, error);
        try {
            await unblockSteveUser(user_with_old_rfid);
            logger.info(`Successfully rolled back block on old RFID ${old_rfid}`);
        } catch (rollbackError) {
            logger.error(`Failed to rollback block on old RFID ${old_rfid}`, rollbackError);
        }
        throw error;
    }

    logger.debug(`RFID changed in SteVe from ${old_rfid} to ${new_rfid}`);
    await db.recordActivityLog(user.user_id, 'CHANGE RFID', 'SteVe', `${old_rfid} -> ${new_rfid}`);
}


module.exports = {
    createSteveUser,
    getSteveUser,
    blockSteveUser,
    unblockSteveUser,
    deleteSteveUser,
    changeRFIDofSteveUser,
};