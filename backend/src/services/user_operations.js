const {getUserUnique, createDBUser, setUserOdooCredentials} = require('../utils/queries');
const {ErrorCodes, SystemError, ValidationError} = require("../utils/errors");
const axios = require("axios");

// Integrity check for any user, or create a new one
const checkUserIntegrity = async (oidc_user) => {
    const user = await getUserUnique({oauth_id: oidc_user.sub});

    if (!user) {
        const createdUser = await createDBUser({
            oauth_id: oidc_user.sub,
            name: oidc_user.name,
            email: oidc_user.email,
            // rfid: oidc_user.rfid,
        });

        await createOdooUser(await createdUser.user_id);
    }

    //TODO: Check remote and local updated_at date
    // and update the user if needed

    // TODO: Check RFID
    // if (oidc_user.rfid) {
    //     const rfid = await getUserUnique({rfid: oidc_user.rfid});
    //     if (!rfid) {
    //         throw new ValidationError(ErrorCodes.USER.RFID_NOT_FOUND);
    //     }

    if (!user.odoo_user_id) {
        await createOdooUser(user.user_id);
    }

    return user;
}


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
    }

    const response = await axios.post(url, data, {headers: headers});

    if (response.status === 201) {
        const data = response.data;
        const success = data['success']
        const odoo_user_id = data['user_id'];
        const odoo_partner_id = data['partner_id'];
        const encrypted_key = data['encrypted_key'];
        const salt = data['salt'];

        try {
            return await setUserOdooCredentials(user.user_id, {
                odoo_user_id: odoo_user_id,
                partner_id: odoo_partner_id,
                encrypted_key: encrypted_key,
                salt: salt
            });
        } catch (error) {
            throw new SystemError(ErrorCodes.USER.ODOO_CREATE_FAILED, error.message);
        }

    } else if (response.status === 409) {
        throw new SystemError(ErrorCodes.USER.ODOO_ALREADY_EXISTS)
    } else {
        const errorMSG = response.data['error'];
        throw new SystemError(ErrorCodes.USER.ODOO_CREATE_FAILED, errorMSG);
    }
}


module.exports = {
    checkUserIntegrity,
    createOdooUser,
}