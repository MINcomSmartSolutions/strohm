const {ValidationError, ErrorCodes, appErrorHandler} = require('../utils/errors');
const {steveAxios} = require('./network');
const {validateSteveUser} = require('../utils/steve');
const logger = require('./logger');
const {setSteveUserParamaters, recordActivityLog} = require('../utils/queries');
const {STEVE_CONFIG} = require('../config');

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
    await setSteveUserParamaters(user, create_response.data.ocppTagPk);

    // Check if the user is returned when queried
    const create_check_query = await getSteveUser(user.rfid);
    if (!create_check_query) {
        throw new Error('User could not be found after creation');
    }

    return create_check_query;
};


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

    recordActivityLog(user.user_id, 'Block', 'SteVe', user.rfid);
};

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

    recordActivityLog(user.user_id, 'Unblock', 'SteVe', user.rfid);
};


module.exports = {
    createSteveUser,
    getSteveUser,
    blockSteveUser,
    unblockSteveUser,
};