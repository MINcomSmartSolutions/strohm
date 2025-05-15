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
const {ValidationError, ErrorCodes} = require('../utils/errors');
const {steveAxios} = require('./network');
const {validateSteveUser} = require('../utils/steve');
const logger = require('./logger');
const {db} = require('../utils/queries');
const {STEVE_CONFIG} = require('../config');


/**
 * Creates a new user in SteVe with the given RFID.
 * - Checks if the user already exists.
 * - Creates the user with the specified block status.
 * - Validates the response and stores the steve_id in the database.
 * - Returns the created user data.
 *
 * @async
 * @param {Object} user - The user object (must include rfid).
 * @param {boolean} [blocked=true] - Whether the user should be created `blocked`.
 * @returns {Promise<Object>} The created user data from SteVe.
 * @throws {ValidationError|Error} If validation fails or creation fails.
 */
const createSteveUser = async (user, blocked = true) => {
    logger.info(`Creating user in Steve with RFID: ${user.rfid}`);

    if (!user.rfid || user.rfid.trim() === '') {
        throw new ValidationError(ErrorCodes.VALIDATION.INVALID_PARAMETERS);
    }

    // Check if the user already exists in SteVe
    const user_query = await getSteveUser(user.rfid);
    if (user_query) {
        throw new ValidationError(ErrorCodes.STEVE.USER_EXISTS);
    }

    const create_response = await steveAxios.post(STEVE_CONFIG.OCPP_TAGS_URI, {
        idTag: user.rfid,
        maxActiveTransactionCount: blocked ? 0 : 1,
        note: 'User created by API by MINcom Smart Solutions GmbH',
    });

    if (create_response.status !== 201) {
        throw new Error('Error creating user in SteVe');
    }

    // Validate the response, ensuring it contains the expected fields and values. Any discrepancies will throw an error.
    validateSteveUser(create_response.data, user.rfid);

    // Set steve_id in the database
    await db.setSteveUserParamaters(user, create_response.data.ocppTagPk);

    // Check if the user is returned when queried
    const create_check_query = await getSteveUser(user.rfid);
    if (!create_check_query) {
        throw new Error('User could not be found after creation');
    }

    return create_check_query;
};


/**
 * Fetches a user from SteVe by RFID.
 * Returns null if not found, throws if multiple found or on error.
 * Validates the user data.
 *
 * @param {string} user_rfid - The user's RFID.
 * @returns {Promise<Object[]|null>} User data array or null if not found.
 * @throws {ValidationError|Error} On invalid input or fetch error.
 */
const getSteveUser = async (user_rfid) => {
    if (!user_rfid || user_rfid.trim() === '') {
        throw new ValidationError(ErrorCodes.VALIDATION.INVALID_PARAMETERS);
    }

    const response = await steveAxios.get(STEVE_CONFIG.OCPP_TAGS_URI, {
        params: {
            idTag: user_rfid,
        },
    });

    if (response.status !== 200) {
        throw new Error('Error fetching user from Steve');
    }
    if (response.data.length === 0) {
        return null; // User not found
    }
    if (response.data.length > 1) {
        throw new Error('Multiple users found with the same RFID, which should be impossible');
    }

    validateSteveUser(response.data[0], user_rfid);

    return response.data;
};


/**
 * Blocks a user in SteVe by setting their maxActiveTransactionCount to 0.
 * Validates input, updates the user, checks the block status, and logs the action.
 *
 * @async
 * @param {Object} user - The user object (must include rfid and steve_id).
 * @throws {ValidationError|Error} If input is invalid or block fails.
 */
const blockSteveUser = async (user) => {
    if (!user || !user.rfid || user.rfid.trim() === '') {
        throw new ValidationError(ErrorCodes.VALIDATION.INVALID_PARAMETERS);
    }

    const response = await steveAxios.put(STEVE_CONFIG.OCPP_TAGS_URI + `/${user.steve_id}`, {
        idTag: user.rfid,
        maxActiveTransactionCount: 0,
        // Maybe also add a note of the reason for blocking
    });
    if (response.status !== 200) {
        throw new Error('Error setting block to user in SteVe');
    }

    // Check if the user is blocked
    if (response.data.maxActiveTransactionCount !== 0 || response.data.blocked !== true) {
        throw new Error('User could not be blocked in SteVe');
    }

    db.recordActivityLog(user.user_id, 'Block', 'SteVe', user.rfid);
};


/**
 * Unblocks a user in SteVe by setting their maxActiveTransactionCount to 1.
 * Validates input, updates the user, checks the unblock status, and logs the action.
 *
 * @async
 * @param {Object} user - The user object (must include rfid and steve_id).
 * @throws {ValidationError|Error} If input is invalid or unblock fails.
 */
const unblockSteveUser = async (user) => {
    if (!user || !user.rfid || user.rfid.trim() === '') {
        throw new ValidationError(ErrorCodes.VALIDATION.INVALID_PARAMETERS);
    }

    const response = await steveAxios.put(STEVE_CONFIG.OCPP_TAGS_URI + `/${user.steve_id}`, {
        idTag: user.rfid,
        maxActiveTransactionCount: 1,
        // Maybe also add a note of the reason for blocking
    });
    if (response.status !== 200) {
        throw new Error('Error removing block to user in SteVe');
    }
    // Check if the user is unblocked
    if (response.data.maxActiveTransactionCount !== 1 || response.data.blocked !== false) {
        throw new Error('User could not be unblocked in SteVe');
    }

    db.recordActivityLog(user.user_id, 'Unblock', 'SteVe', user.rfid);
};


module.exports = {
    createSteveUser,
    getSteveUser,
    blockSteveUser,
    unblockSteveUser,
};