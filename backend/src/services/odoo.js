const {ValidationError, ErrorCodes, SystemError} = require('../utils/errors');
const axios = require('axios');
const {
    setUserOdooCredentials,
    getUserUnique,
    getUserOdooCredentials,
    rotateOdooUserKey,
} = require('../utils/queries');

const {generateOdooSignature} = require('../helpers/auth');
const {identifyUser} = require('../helpers/user');
const {getHeaders} = require('./network');
const {DateTime} = require('luxon');
const {datetimeEPSFormat} = require('../utils/datetime');


const createOdooUser = async (identifier) => {
    const user = await identifyUser(identifier);

    if (user.odoo_user_id !== null) {
        throw new ValidationError(ErrorCodes.USER.ODOO_EXISTS);
    }

    const url = process.env.ODOO_HOST + '/internal/create';
    const data = {
        name: user.name,
        email: user.email,
    };
    const response = await axios.post(url, data, {headers: getHeaders()});

    if (response.status === 201) {
        const data = response.data;
        const timestamp = data['timestamp'];
        const odoo_user_id = data['user_id'];
        const odoo_partner_id = data['partner_id'];
        const encrypted_key = data['encrypted_key'];
        const salt = data['salt'];
        const hash = data['hash'];


        // Verify the hash to ensure data integrity
        const message = `${timestamp}${odoo_user_id}${odoo_partner_id}${encrypted_key}${salt}`;
        const calculatedHash = generateOdooSignature(message, process.env.ODOO_API_SECRET);

        // Compare the calculated hash with the hash received from Odoo
        if (calculatedHash !== hash) {
            throw new SystemError(ErrorCodes.ODOO.VERIFICATION_FAILED, 'Hash verification failed');
        }

        await setUserOdooCredentials(user.user_id, {
            odoo_user_id: odoo_user_id,
            partner_id: odoo_partner_id,
            encrypted_key: encrypted_key,
            salt: salt,
        });

        return getUserUnique({user_id: user.user_id});
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
    const {key, salt} = odoo_credentials;
    if (!odoo_credentials || !key || !salt) {
        throw new ValidationError(ErrorCodes.USER.ODOO_NO_CREDENTIALS);
        //TODO: Instead of throwing an error, ask for a key rotation
    }

    // Construct the Odoo portal login URL
    // Used URL constructor to ensure proper encoding instead of String concatenation
    const loginUrl = new URL('/portal_login', process.env.ODOO_HOST);

    let timestamp = DateTime.now().toFormat(datetimeEPSFormat);

    const message = `${timestamp}${user.odoo_user_id}${key}${salt}`;
    const signature = generateOdooSignature(
        message,
        process.env.ODOO_API_SECRET,
    );

    loginUrl.searchParams.append('timestamp', timestamp);
    loginUrl.searchParams.append('api_key', key);
    loginUrl.searchParams.append('salt', salt);
    loginUrl.searchParams.append('signature', signature);

    return loginUrl.toString();
};


const rotateOdooUserAuth = async (identifier) => {
    const user = await identifyUser(identifier, {requireOdooUser: true});

    const odoo_credentials = await getUserOdooCredentials(user.user_id);
    const {key_id, key, salt} = odoo_credentials;
    const data = {
        user_id: user.odoo_user_id,
        api_key: key,
        salt: salt,
    };

    const url = new URL(process.env.ODOO_HOST + '/internal/rotate_api_key');

    const response = await axios.post(url.toString(), data, {headers: getHeaders()});
    if (response.status === 200) {
        const data = response.data;
        const odoo_user_id = data['user_id'];
        const new_key = data['encrypted_key'];
        const new_salt = data['salt'];

        if (odoo_user_id !== user.odoo_user_id) {
            throw new SystemError(ErrorCodes.User.ODOO_ID_MISMATCH);
        }

        const db_query = rotateOdooUserKey(user.user_id, key_id, new_key, new_salt);
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