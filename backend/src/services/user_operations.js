const {ErrorCodes, SystemError, ValidationError} = require('../utils/errors');
const axios = require('axios');
const {
    getUserUnique,
    createDBUser,
    setUserOdooCredentials,
    getUserOdooCredentials,
    rotateOdooUserCredentials,
} = require('../utils/queries');

/**
 * @typedef {Object} user
 * @property {string} user_id - The user's ID
 * @property {string} name - The user's name
 * @property {string} email - The user's email
 * @property {string|null} odoo_user_id - The user's Odoo ID
 * @property {string} oauth_id - The Subject Identifier
 */


const getHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.ODOO_ADMIN_API_KEY}`,
});


const userOperations = async (oidc_user) => {
    const user = await getUserUnique({oauth_id: oidc_user.sub});

    if (!user) {
        const createdUser = await createDBUser({
            oauth_id: oidc_user.sub,
            name: oidc_user.name,
            email: oidc_user.email,
            // rfid: oidc_user.rfid,
        });

        return await createOdooUser(await createdUser.user_id);
    } else if (user && !user.odoo_user_id) {
        return await createOdooUser(user.user_id);
    } else {
        // User already exists and has an Odoo ID
        return user;
    }


    // return true;

    // TODO: Check valid payment method
    // TODO: Check for fraud

    //TODO: Check remote and local updated_at date
    // and update the user if needed

    // TODO: Check RFID
    // if (oidc_user.rfid) {
    //     const rfid = await getUserUnique({rfid: oidc_user.rfid});
    //     if (!rfid) {
    //         throw new ValidationError(ErrorCodes.USER.RFID_NOT_FOUND);
    //     }

};


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
    const {token, salt} = odoo_credentials;
    if (!odoo_credentials || !token || !salt) {
        throw new ValidationError(ErrorCodes.USER.ODOO_NO_CREDENTIALS);
        //TODO: Instead of throwing an error, ask for a token rotation
    }

    const url = process.env.ODOO_HOST + '/portal_login';

    // Return full url with the token and the salt in parameters
    return `${url}?api_key=${token}&salt=${salt}`;
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

    const url = process.env.ODOO_HOST + '/internal/rotate_api_key';

    const response = await axios.post(url, data, {headers: getHeaders()});

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

/**
 * Gets a user by either user_id or oauth_id
 *
 * @param {number|string} identifier - Either user_id or oauth_id
 * @param {Object} options - Additional options
 * @param {boolean} options.requireOdooUser - If true, verify user has an Odoo ID
 * @returns {Promise<Object>} - User object
 * @throws {ValidationError} - If user not found or doesn't meet requirements
 */
const identifyUser = async (identifier, options = {}) => {
    let user;

    if (typeof identifier === 'number' || !isNaN(parseInt(identifier))) {
        user = await getUserUnique({user_id: parseInt(identifier)});
    } else {
        user = await getUserUnique({oauth_id: identifier});
    }

    if (!user) {
        throw new ValidationError(ErrorCodes.USER.NOT_FOUND);
    }

    if (options.requireOdooUser && !user.odoo_user_id) {
        throw new ValidationError(ErrorCodes.USER.ODOO_NOT_FOUND);
    }

    return user;
};


module.exports = {
    userOperations,
    createOdooUser,
    getOdooPortalLogin,
    rotateOdooUserToken,
    identifyUser,
};