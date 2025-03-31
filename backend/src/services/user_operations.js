const {getUserUnique, createDBUser, setUserOdooCredentials, getUserOdooCredentials} = require('../utils/queries');
const {ErrorCodes, SystemError, ValidationError} = require('../utils/errors');
const axios = require('axios');

/**
 * @typedef {Object} user
 * @property {string} user_id - The user's ID
 * @property {string} name - The user's name
 * @property {string} email - The user's email
 * @property {string|null} odoo_user_id - The user's Odoo ID
 * @property {string} oauth_id - The Subject Identifier
 */



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


const createOdooUser = async (user_id) => {
    const user = await getUserUnique({user_id: user_id});

    if (!user || user.length === 0) {
        throw new ValidationError(ErrorCodes.USER.NOT_FOUND);
    }

    if (user.odoo_user_id !== null) {
        throw new ValidationError(ErrorCodes.USER.ODOO_ALREADY_EXISTS_DB);
    }

    // const url = process.env.ODOO_HOST + '/portal/internal/create';
    const url = process.env.ODOO_HOST + '/internal/create';
    const data = {
        name: user.name,
        email: user.email,
    };

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ODOO_ADMIN_API_KEY}`,
    };

    const response = await axios.post(url, data, {headers: headers});

    if (response.status === 201) {
        const data = response.data;
        const success = data['success'];
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
        throw new SystemError(ErrorCodes.USER.ODOO_ALREADY_EXISTS);
    } else {
        const errorMSG = response.data['error'];
        throw new SystemError(ErrorCodes.USER.ODOO_CREATE_FAILED, errorMSG);
    }
};


const getOdooPortalLogin = async (user_id) => {
    //TODO: Redirecting internally or externally?
    const user = await getUserUnique({user_id: user_id});

    if (!user) {
        throw new ValidationError(ErrorCodes.USER.NOT_FOUND);
    }

    if (!user.odoo_user_id) {
        throw new ValidationError(ErrorCodes.USER.ODOO_NOT_FOUND);
    }

    const odoo_credentials = await getUserOdooCredentials(user_id);
    const {token, salt} = odoo_credentials;
    if (!odoo_credentials || !token || !salt) {
        throw new ValidationError(ErrorCodes.USER.ODOO_NO_CREDENTIALS);
        //TODO: Instead of throwing an error, ask for a token rotation
    }

    const url = process.env.ODOO_HOST + '/portal_login';

    // Redirect with the token and the salt in parameters
    const redirect_url = `${url}?api_key=${token}&salt=${salt}`;
    return redirect_url;
};


module.exports = {
    userOperations,
    createOdooUser,
    getOdooPortalLogin,
};