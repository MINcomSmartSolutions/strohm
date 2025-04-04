const {createOdooUser} = require('./odoo');
const {getUserUnique, createDBUser} = require('../utils/queries');

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
        // User exists but doesn't have an Odoo ID
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


module.exports = {
    userOperations,
};