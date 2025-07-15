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
const {ValidationError, ErrorCodes, SystemError} = require('../utils/errors');
const {steveAxios} = require('./network');
const {validateSteveUser} = require('../utils/steve');
const logger = require('./logger');
const {db} = require('../utils/queries');
const {STEVE_CONFIG} = require('../config');
const {fullyQualifiedUserSchema} = require('../utils/joi');


/**
 * Creates a new user in SteVe with the given RFID.
 * - Checks if the user already exists.
 * - Creates the user with the specified block status.
 * - Validates the response and stores the steve_id in the database.
 * - Returns the created user data.
 *
 * @async
 * @param {Object} user - The user object (must include rfid).
 * @param {boolean} [blocked=false] - Whether the user should be created `blocked`.
 * @returns {Promise<Object>} The created user data from SteVe.
 * @throws {ValidationError|Error} If validation fails or creation fails.
 */
const createSteveUser = async (user, blocked = false) => {
    if (!user || !user.rfid || user.rfid.trim() === '') {
        throw new ValidationError(ErrorCodes.VALIDATION.INVALID_PARAMETERS);
    }

    logger.info(`Creating user in Steve with RFID: ${user.rfid}`);

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

    if (!create_response) {
        throw new SystemError(ErrorCodes.STEVE.NO_RESPONSE, 'No response from SteVe while creating user');
    }
    if (create_response.status !== 201) {
        throw new SystemError(ErrorCodes.STEVE.USER_CREATE_FAILED, `Failed to create user in SteVe: ${create_response.statusText}`);
    }

    // Validate the response, ensuring it contains the expected fields and values. Any discrepancies will throw an error.
    validateSteveUser(create_response.data, user.rfid);

    // Set steve_id in user's table
    await db.setSteveUserParamaters(user, create_response.data.ocppTagPk);

    // Check if the user is returned when queried
    const create_check_query = await getSteveUser(user.rfid);
    if (!create_check_query) {
        throw new SystemError(ErrorCodes.STEVE.USER_NOT_FOUND, `User with RFID ${user.rfid} not found after creation in SteVe`);
    }

    logger.debug('User created in SteVe with RFID: ' + user.rfid + ' and steve_id: ' + create_check_query.ocppTagPk);
    await db.recordActivityLog(user.user_id, 'CREATE USER', 'SteVe', user.rfid);
    if (blocked) {
        await db.recordActivityLog(user.user_id, 'BLOCK USER', 'SteVe', user.rfid);
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
    const {error} = fullyQualifiedUserSchema.validate(user);
    if (error) {
        throw new ValidationError(ErrorCodes.VALIDATION.INVALID_PARAMETERS, error.message);
    }

    const response = await steveAxios.put(STEVE_CONFIG.OCPP_TAGS_URI + `/${user.steve_id}`, {
        idTag: user.rfid,
        maxActiveTransactionCount: 0,
        // Maybe also add a note of the reason for blocking
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

    await db.recordActivityLog(user.user_id, 'BLOCK USER', 'SteVe', user.rfid);
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

    await db.recordActivityLog(user.user_id, 'UNBLOCK USER', 'SteVe', user.rfid);
};


module.exports = {
    createSteveUser,
    getSteveUser,
    blockSteveUser,
    unblockSteveUser,
};