/**
 * @file Odoo Integration Service
 *
 * It is responsible for user creation, login, key rotation, and invoicing with Odoo via REST API.
 *
 * @module services/odoo
 */
const {ValidationError, ErrorCodes, SystemError, ResponseError} = require('../utils/errors');
const {db} = require('../utils/queries');

const {generateOdooHash, generateSalt} = require('../helpers/auth');
const {odooAxios, odooUserAxios} = require('./network');
const {DateTime} = require('luxon');
const {fmt} = require('../utils/datetime_format');
const {ODOO_CONFIG} = require('../config');
const {dbTransactionSchema, fullyQualifiedUserSchema} = require('../utils/joi');
const logger = require('../services/logger');


/**
 * Creates a new Odoo user.
 *
 * - Throws if the user already has an Odoo user ID.
 * - Sends a POST request to Odoo to create the user.
 * - Verifies the response hash for integrity.
 * - Stores Odoo credentials in the database.
 * - Logs the creation activity.
 * @async
 * @param {Object} user - User object with at least name and email.
 * @throws {ValidationError|SystemError} On validation or Odoo errors.
 */
async function createOdooUser(user) {
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
            if (process.env.NODE_ENV !== 'production') {
                // FIXME
                logger.error('Hash verification failed');
                logger.error('Message: ', message.toString());
                logger.error(`Calculated: ${calculatedHash}`);
                logger.error(`Received: ${hash}`);
            }
            // throw new SystemError(ErrorCodes.ODOO.HASH_VERIFICATION_FAILED);
        }

        await db.setUserOdooCredentials(user,
            odoo_user_id,
            odoo_partner_id,
            encrypted_key,
            key_salt,
        );
        db.recordActivityLog(user.user_id, 'CREATE USER', 'Odoo', user.rfid);
    } else if (response.status === 409) {
        throw new SystemError(ErrorCodes.ODOO.USER_EXISTS);
    } else {
        const errorMSG = response.data['error'];
        throw new SystemError(ErrorCodes.ODOO.USER_CREATE_FAILED, errorMSG);
    }
}


/**
 * Generates a secure Odoo portal login URL for the given user.
 *
 * - Validates the user object.
 * - Fetches Odoo credentials from the database.
 * - Constructs a login URL with required query parameters for authentication.
 * - Throws if credentials are missing or invalid.
 *
 * @async
 * @param {Object} user - User object with odoo_user_id and user_id.
 * @throws {ValidationError} If user or credentials are invalid.
 * @returns {string} Odoo portal login URL.
 */
async function getOdooPortalLogin(user) {
    const {error} = fullyQualifiedUserSchema.validate(user);
    if (error) {
        throw new ValidationError(ErrorCodes.VALIDATION.INVALID_FORMAT,
            `Invalid user ${error.message}`);
    }

    const odoo_credentials = await db.getUserOdooCredentials(user.user_id);
    const {key, key_salt} = odoo_credentials;
    const _salt = generateSalt();
    if (!odoo_credentials || !key || !key_salt) {
        throw new ValidationError(ErrorCodes.USER.ODOO_NO_CREDENTIALS);
        //TODO: Instead of throwing an error, ask for a key rotation
    }

    // Construct the Odoo portal login URL
    // Used URL constructor to ensure proper encoding instead of String concatenation
    // We don't use `axiosOdoo` instance here because we only redirect the user to the Odoo with credentials
    const loginUrl = new URL(ODOO_CONFIG.PORTAL_LOGIN_URI, ODOO_CONFIG.EXTERNAL_URL);

    let timestamp = fmt(DateTime.now());
    const message = `${timestamp}${user.odoo_user_id}${key}${key_salt}${_salt}`;
    const _hash = generateOdooHash(message, ODOO_CONFIG.API_SECRET);

    loginUrl.searchParams.append('timestamp', timestamp);
    loginUrl.searchParams.append('key', key);
    loginUrl.searchParams.append('key_salt', key_salt);
    loginUrl.searchParams.append('salt', _salt);
    loginUrl.searchParams.append('hash', _hash);

    return loginUrl.toString();
}


/**
 * Rotates the Odoo user API key for the given user.
 *
 * - Validates the user object.
 * - Fetches current Odoo credentials from the database.
 * - Requests a new API key from Odoo and verifies the response hash.
 * - Updates the database with the new key and salt.
 * - Returns the updated Odoo credentials.
 *
 * @async
 * @param {Object} user - User object with odoo_user_id and user_id.
 * @throws {ValidationError|SystemError} On validation or Odoo errors.
 * @returns {Promise<Object>} Updated Odoo credentials.
 */
async function rotateOdooUserAuth(user) {
    const {error} = fullyQualifiedUserSchema.validate(user);
    if (error) {
        throw new ValidationError(ErrorCodes.VALIDATION.INVALID_FORMAT,
            `Invalid user ${error.message}`);
    }

    const odoo_credentials = await db.getUserOdooCredentials(user.user_id);
    const {key_id, key, key_salt} = odoo_credentials;
    let data = {
        timestamp: fmt(DateTime.now()),
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

        const db_query = db.rotateOdooUserKey(user.user_id, key_id, new_key, new_key_salt);
        if (!db_query) {
            throw new SystemError(ErrorCodes.USER.KEY_ROTATION_FAILED);
        }
        db.recordActivityLog(user.user_id, 'ROTATE USER KEY', 'Odoo', user.rfid);
        return db.getUserOdooCredentials(user.user_id);
    } else {
        const errorMSG = response.data['error'];
        throw new SystemError(ErrorCodes.ODOO.KEY_ROTATION_FAILED, errorMSG);
    }
}


/**
 * Creates a bill/invoice in Odoo for a given transaction.
 *
 * Request payload to Odoo:
 *   session_start (datetime): Session start datetime in UTC.
 *   session_end (datetime): Session end datetime in UTC.
 *   partner_id (int): ID of the sale/customer (`res.partner`).
 *   lines_data (list[dict]): Invoice line data dict with the following fields:
 *     - name (str): Product name.
 *     - sku (str): Internal reference for product.
 *     - uom_name (str): Unit of measure name (e.g., "kWh"; only "kWh" accepted for now).
 *     - base_price (float): Standard list price for product (e.g., 0.35).
 *     - custom_rate (float): Actual invoice price (e.g., 0.38).
 *     - quantity (float): Consumed quantity (e.g., 150, in kWh).
 *     // TODO: Add more fields if needed. e.g. payment terms, bill_date etc.
 *
 * - Validates the transaction object.
 * - Fetches Odoo credentials for the user.
 * - Prepares invoice line data.
 * - Sends a POST request to Odoo to create the invoice.
 * - Throws if creation fails.
 *
 * @async
 * @param {Object} db_txn - Transaction object from the database.
 * @returns {Promise<string>} The created bill ID.
 * @throws {ValidationError|SystemError} On validation or Odoo errors.
 */
async function createOdooTxnInvoice(db_txn) {
    const {error} = dbTransactionSchema.validate(db_txn);
    if (error) {
        throw new ValidationError(ErrorCodes.VALIDATION.INVALID_FORMAT,
            `Invalid transaction ${error.message}`);
    }

    const {key, key_salt} = await db.getUserOdooCredentials(db_txn.user_id);
    const user = await db.getUserUnique({user_id: db_txn.user_id});
    // The price of electricity at the time of transaction start
    const txn_started_with_electricity_price = await db.getCurrentElectricityPrice(DateTime.fromJSDate(db_txn.start_timestamp));

    const lines_data = [
        {
            // 'name': 'Ladung AC',
            'sku': 'standard_charging',
            // 'uom_name': 'kWh',
            // 'base_price': 0.35,
            'custom_rate': txn_started_with_electricity_price / 100 ?? 0.35,
            'quantity': db_txn.delivered_energy_wh / 1000,
        },
    ];


    const data = {
        timestamp: fmt(DateTime.utc()),
        key: key,
        key_salt: key_salt,
        session_start: fmt(DateTime.fromJSDate(db_txn.start_timestamp)),
        session_end: fmt(DateTime.fromJSDate(db_txn.stop_timestamp)),
        lines_data: lines_data,
    };

    const response = await odooUserAxios.post(ODOO_CONFIG.INVOICE_CREATION_URI, data);
    if (response.status !== 201) {
        const errorMSG = response.data['error'];
        throw new SystemError(ErrorCodes.ODOO.INVOICE_CREATE_FAILED, errorMSG);
    }

    db.recordActivityLog(user.user_id, 'CREATE INVOICE', 'ODOO', user.rfid);
    return response.data['bill_id'];
}


/**
 * Checks if the given user has a valid payment method in Odoo.
 *
 * - Validates the user object.
 * - Fetches Odoo credentials for the user.
 * - Constructs and signs a request to Odoo to check payment method validity.
 * - Verifies the response hash for integrity.
 * - Returns true if the payment method is valid, false otherwise.
 *
 * @async
 * @param {Object} user - User object with odoo_user_id, odoo_partner_id, and user_id.
 * @returns {Promise<boolean>} True if payment method is valid, false otherwise.
 * @throws {ValidationError|SystemError} On validation or Odoo errors.
 */
async function checkValidPaymentMethod(user) {
    const {error} = fullyQualifiedUserSchema.validate(user);
    if (error) {
        throw new ValidationError(ErrorCodes.VALIDATION.INVALID_FORMAT,
            `Invalid user ${error.message}`);
    }

    const odoo_credentials = await db.getUserOdooCredentials(user.user_id);
    const {key, key_salt} = odoo_credentials;
    const salt = generateSalt();
    const data = {
        timestamp: fmt(DateTime.now()),
        user_id: user.odoo_user_id,
        partner_id: user.odoo_partner_id,
        key: key,
        key_salt: key_salt,
        salt: salt,
    };
    const message = `${data.timestamp}${data.user_id}${data.partner_id}${data.key}${data.key_salt}${data.salt}`;
    data.hash = generateOdooHash(message, ODOO_CONFIG.API_SECRET);

    const response = await odooAxios.post(ODOO_CONFIG.CHECK_PAYMENT_METHOD_URI, data);
    if (response.status === 200) {
        const data = response.data;
        const timestamp = data['timestamp'];
        const result = data['result']; // 1 for valid, 0 for invalid
        const salt = data['salt'];
        const hash = data['hash'];

        if (!timestamp || !salt || !hash || result === undefined || result === null) {
            throw new ResponseError(ErrorCodes.ODOO.INVALID_RESPONSE);
        }

        // Verify hash
        const message = `${timestamp}${result}${salt}`;
        const expected_hash = generateOdooHash(message, ODOO_CONFIG.API_SECRET);
        if (expected_hash !== hash) {
            throw new ResponseError(ErrorCodes.ODOO.HASH_VERIFICATION_FAILED);
        }

        logger.info('Payment method check result: ' + result);
        return (result === 1);
    } else {
        logger.error(`Error checking payment method: ${response.status}, ${response.data}`);
        throw new SystemError(ErrorCodes.ODOO.PAYMENT_METHOD_VALIDITY_CHECK_FAILED);
    }
}


module.exports = {
    createOdooUser,
    getOdooPortalLogin,
    rotateOdooUserAuth,
    createOdooTxnInvoice,
    checkValidPaymentMethod,
};