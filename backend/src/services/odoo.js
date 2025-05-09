const {ValidationError, ErrorCodes, SystemError} = require('../utils/errors');
const {
    setUserOdooCredentials,
    getUserOdooCredentials,
    rotateOdooUserKey,
} = require('../utils/queries');

const {generateOdooHash, generateSalt} = require('../helpers/auth');
const {odooAxios} = require('./network');
const {DateTime} = require('luxon');
const {ISO_EPS_NO_ZONE} = require('../utils/datetime_format');
const {ODOO_CONFIG} = require('../config');


const createOdooUser = async (user) => {
    if (user.odoo_user_id !== null) {
        throw new ValidationError(ErrorCodes.USER.ODOO_EXISTS);
    }

    const data = {
        name: user.name,
        email: user.email,
    };

    const response = await odooAxios.post(ODOO_CONFIG.USER_CREATION_URI, data);
    if (response.status === 201) {
        const data = response.data;
        const timestamp = data['timestamp'];
        const odoo_user_id = data['user_id'];
        const odoo_partner_id = data['partner_id'];
        const encrypted_key = data['key'];
        const key_salt = data['key_salt'];
        const hash = data['hash'];
        const salt = data['salt'];


        // Verify the hash to ensure data integrity
        const message = `${timestamp}${odoo_user_id}${odoo_partner_id}${encrypted_key}${key_salt}${salt}`;
        const calculatedHash = generateOdooHash(message, ODOO_CONFIG.API_SECRET);

        // Compare the calculated hash with the hash received from Odoo
        if (calculatedHash !== hash) {
            throw new SystemError(ErrorCodes.ODOO.HASH_VERIFICATION_FAILED, 'Hash verification failed');
        }

        await setUserOdooCredentials(user, {
            odoo_user_id: odoo_user_id,
            partner_id: odoo_partner_id,
            encrypted_key: encrypted_key,
            salt: key_salt,
        });

    } else if (response.status === 409) {
        throw new SystemError(ErrorCodes.ODOO.USER_EXISTS);
    } else {
        const errorMSG = response.data['error'];
        throw new SystemError(ErrorCodes.ODOO.USER_CREATE_FAILED, errorMSG);
    }
};


const getOdooPortalLogin = async (user) => {
    if (!user.odoo_user_id) {
        throw new ValidationError(ErrorCodes.USER.ODOO_NOT_FOUND);
    }

    const odoo_credentials = await getUserOdooCredentials(user.user_id);
    const {key, key_salt} = odoo_credentials;
    const _salt = generateSalt();
    if (!odoo_credentials || !key || !key_salt) {
        throw new ValidationError(ErrorCodes.USER.ODOO_NO_CREDENTIALS);
        //TODO: Instead of throwing an error, ask for a key rotation
    }

    // Construct the Odoo portal login URL
    // Used URL constructor to ensure proper encoding instead of String concatenation
    // We don't use `axiosOdoo` instance here because we only redirect the user to the Odoo with credentials
    const loginUrl = new URL(ODOO_CONFIG.PORTAL_LOGIN_URI, ODOO_CONFIG.HOST);

    let timestamp = DateTime.utc().toFormat(ISO_EPS_NO_ZONE);

    const message = `${timestamp}${user.odoo_user_id}${key}${key_salt}${_salt}`;
    const _hash = generateOdooHash(message, ODOO_CONFIG.API_SECRET);

    loginUrl.searchParams.append('timestamp', timestamp);
    loginUrl.searchParams.append('key', key);
    loginUrl.searchParams.append('key_salt', key_salt);
    loginUrl.searchParams.append('salt', _salt);
    loginUrl.searchParams.append('hash', _hash);

    return loginUrl.toString();
};


const rotateOdooUserAuth = async (user) => {
    if (!user.odoo_user_id) {
        throw new ValidationError(ErrorCodes.USER.ODOO_NOT_FOUND);
    }

    const odoo_credentials = await getUserOdooCredentials(user.user_id);
    const {key_id, key, key_salt} = odoo_credentials;
    let data = {
        timestamp: DateTime.utc().toFormat(ISO_EPS_NO_ZONE),
        user_id: user.odoo_user_id,
        key: key,
        key_salt: key_salt,
        salt: generateSalt(),
    };
    const message = `${data.timestamp}${data.user_id}${data.key}${data.key_salt}${data.salt}`;
    data.hash = generateOdooHash(message, ODOO_CONFIG.API_SECRET);

    const response = await odooAxios.post(ODOO_CONFIG.ROTATE_APIKEY_URI, data);
    if (response.status === 200) {
        const data = response.data;
        const timestamp = data['timestamp'];
        const odoo_user_id = data['user_id'];
        const new_key = data['key'];
        const new_key_salt = data['key_salt'];
        const salt = data['salt'];
        const hash = data['hash'];

        const message = `${timestamp}${user.odoo_user_id}${new_key}${new_key_salt}${salt}`;
        const expected_hash = generateOdooHash(message, ODOO_CONFIG.API_SECRET);
        // Compare the calculated hash with the hash received from Odoo
        if (expected_hash !== hash) {
            throw new SystemError(ErrorCodes.ODOO.HASH_VERIFICATION_FAILED, 'Hash verification failed');
        }

        if (odoo_user_id !== user.odoo_user_id) {
            throw new SystemError(ErrorCodes.User.ODOO_ID_MISMATCH);
        }

        const db_query = rotateOdooUserKey(user.user_id, key_id, new_key, new_key_salt);
        if (!db_query) {
            throw new SystemError(ErrorCodes.USER.KEY_ROTATION_FAILED);
        }
        return getUserOdooCredentials(user.user_id);
    } else {
        const errorMSG = response.data['error'];
        throw new SystemError(ErrorCodes.ODOO.KEY_ROTATION_FAILED, errorMSG);
    }
};


module.exports = {
    createOdooUser,
    getOdooPortalLogin,
    rotateOdooUserAuth,
};