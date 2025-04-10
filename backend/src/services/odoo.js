const {ValidationError, ErrorCodes, SystemError} = require('../utils/errors');
const axios = require('axios');
const {
    setUserOdooCredentials,
    getUserUnique,
    getUserOdooCredentials,
    rotateOdooUserCredentials,
} = require('../utils/queries');

const {generateSignature} = require('../helpers/auth');
const {identifyUser} = require('../helpers/user');
const {getHeaders} = require('./network');
const {DateTime} = require('luxon');


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
        // const success = data['success'];
        const odoo_user_id = data['user_id'];
        const odoo_partner_id = data['partner_id'];
        const encrypted_key = data['encrypted_key'];
        const salt = data['salt'];

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

    let timestamp = DateTime.now().toISO({
        includeOffset: false,
    });

    timestamp = timestamp.replace(/-/g, '');
    timestamp = timestamp.split('.')[0];

    // Create secure login parameters
    const state = {
        key,
        timestamp,
        odoo_user_id: user.odoo_user_id,
        salt,
    };
    const signature = generateSignature(
        state,
        process.env.ODOO_API_SECRET,
    );

    loginUrl.searchParams.append('api_key', key);
    loginUrl.searchParams.append('salt', salt);
    loginUrl.searchParams.append('timestamp', timestamp);
    loginUrl.searchParams.append('signature', signature);

    return loginUrl.toString();
};


const rotateOdooUserToken = async (identifier) => {
    const user = await identifyUser(identifier, {requireOdooUser: true});

    const odoo_credentials = await getUserOdooCredentials(user.user_id);
    const {token_id, token, salt} = odoo_credentials;
    const data = {
        user_id: user.odoo_user_id,
        api_key: token,
        salt: salt,
    };

    const url = new URL(process.env.ODOO_HOST + '/internal/rotate_api_key');

    const response = await axios.post(url.toString(), data, {headers: getHeaders()});
    if (response.status === 200) {
        const data = response.data;
        const odoo_user_id = data['user_id'];
        const new_token = data['encrypted_key'];
        const new_salt = data['salt'];

        if (odoo_user_id !== user.odoo_user_id) {
            throw new SystemError(ErrorCodes.User.ODOO_ID_MISMATCH);
        }

        const db_query = rotateOdooUserCredentials(user.user_id, token_id, new_token, new_salt);
        if (!db_query) {
            throw new SystemError(ErrorCodes.USER.TOKEN_ROTATION_FAILED);
        }
        return getUserOdooCredentials(user.user_id);
    } else {
        const errorMSG = response.data['error'];
        throw new SystemError(ErrorCodes.ODOO.TOKEN_ROTATION_FAILED, errorMSG);
    }
};


module.exports = {
    createOdooUser,
    getOdooPortalLogin,
    rotateOdooUserToken,
};