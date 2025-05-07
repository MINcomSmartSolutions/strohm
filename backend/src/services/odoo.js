const {ValidationError, ErrorCodes, SystemError} = require('../utils/errors');
const {
    setUserOdooCredentials,
    getUserOdooCredentials,
    rotateOdooUserKey,
} = require('../utils/queries');

const {generateOdooHash, generateSalt} = require('../helpers/auth');
const {identifyUser} = require('../helpers/user');
const {odooAxios} = require('./network');
const {DateTime} = require('luxon');
const {datetimeEPSFormat} = require('../utils/datetime_format');


const createOdooUser = async (user) => {
    if (user.odoo_user_id !== null) {
        throw new ValidationError(ErrorCodes.USER.ODOO_EXISTS);
    }

    const user_creation_uri = '/internal/user/create';
    const data = {
        name: user.name,
        email: user.email,
    };

    const response = await odooAxios.post(user_creation_uri, data);
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
        const calculatedHash = generateOdooHash(message, process.env.ODOO_API_SECRET);

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


const getOdooPortalLogin = async (identifier) => {
    const user = await identifyUser(identifier, {requireOdooUser: true});

    const odoo_credentials = await getUserOdooCredentials(user.user_id);
    const {key, key_salt} = odoo_credentials;
    const _salt = generateSalt();
    if (!odoo_credentials || !key || !key_salt) {
        throw new ValidationError(ErrorCodes.USER.ODOO_NO_CREDENTIALS);
        //TODO: Instead of throwing an error, ask for a key rotation
    }

    // Construct the Odoo portal login URL
    // Used URL constructor to ensure proper encoding instead of String concatenation
    const loginUrl = new URL('/portal_login', process.env.ODOO_HOST);

    let timestamp = DateTime.utc().toFormat(datetimeEPSFormat);

    const message = `${timestamp}${user.odoo_user_id}${key}${key_salt}${_salt}`;
    const _hash = generateOdooHash(
        message,
        process.env.ODOO_API_SECRET,
    );

    loginUrl.searchParams.append('timestamp', timestamp);
    loginUrl.searchParams.append('key', key);
    loginUrl.searchParams.append('key_salt', key_salt);
    loginUrl.searchParams.append('salt', _salt);
    loginUrl.searchParams.append('hash', _hash);

    return loginUrl.toString();
};


const rotateOdooUserAuth = async (identifier) => {
    const user = await identifyUser(identifier, {requireOdooUser: true});

    const odoo_credentials = await getUserOdooCredentials(user.user_id);
    const {key_id, key, key_salt} = odoo_credentials;
    let data = {
        timestamp: DateTime.utc().toFormat(datetimeEPSFormat),
        user_id: user.odoo_user_id,
        key: key,
        key_salt: key_salt,
        salt: generateSalt(),
    };
    const message = `${data.timestamp}${data.user_id}${data.key}${data.key_salt}${data.salt}`;
    data.hash = generateOdooHash(
        message,
        process.env.ODOO_API_SECRET,
    );


    const url = '/internal/rotate_api_key';
    const response = await odooAxios.post(url, data);
    if (response.status === 200) {
        const data = response.data;
        const timestamp = data['timestamp'];
        const odoo_user_id = data['user_id'];
        const new_key = data['key'];
        const new_key_salt = data['key_salt'];
        const salt = data['salt'];
        const hash = data['hash'];

        const message = `${timestamp}${user.odoo_user_id}${new_key}${new_key_salt}${salt}`;
        const expected_hash = generateOdooHash(
            message,
            process.env.ODOO_API_SECRET,
        );

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