const {createOdooUser} = require('./odoo');
const {db} = require('../utils/queries');
const {createSteveUser} = require('./steve_user');

/**
 * @typedef {Object} User
 * @property {string} user_id - The user's ID
 * @property {string} name - The user's name
 * @property {string} email - The user's email
 * @property {string|null} odoo_user_id - The user's Odoo ID
 * @property {string} oauth_id - The OAuth ID
 * @property {string} rfid - The user's RFID
 * @property {string} steve_id - The user's OCPP tag primary key in SteVe
 */


const userOperations = async (oidc_user) => {
    let user = await db.getUserUnique({oauth_id: oidc_user.sub});

    if (!user) {
        // Use random RFID for development
        const rfid = Math.random().toString(36).substring(2, 10);
        // const rfid = oidc_user.rfid,

        const createdUser = await db.createUser(
            oidc_user.sub,
            oidc_user.name,
            oidc_user.email,
            rfid,
        );

        await createOdooUser(createdUser);
        await createSteveUser(createdUser);
        user = await db.getUserUnique({user_id: createdUser.user_id});
    } else if (user && !user.odoo_user_id) {
        // User exists but doesn't have an Odoo ID
        await createOdooUser(user);
        user = await db.getUserUnique({user_id: user.user_id});
    } else if (user && user.odoo_user_id && !user.steve_id) {
        await createSteveUser(user);
        user = await db.getUserUnique({user_id: user.user_id});
    }

    return user;

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