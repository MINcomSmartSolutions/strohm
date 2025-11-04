/**
 * @file Odoo Integration Service
 *
 * It is responsible for user creation, login, key rotation, and invoicing with Odoo via REST API.
 *
 * @module services/odoo
 */
const {ValidationError, ErrorCodes, SystemError, ResponseError} = require('#utils/errors');
const {db} = require('#utils/queries');

const {generateOdooHash, generateSalt} = require('#helpers/auth');
const {odooAuthedAxios, odooPlainAxios} = require('./network');
const {DateTime} = require('luxon');
const {fmt} = require('#utils/datetime_format');
const {ODOO_CONFIG} = require('#config');
const {qualifiedTransactionSchema, fullyQualifiedUserSchema, validateUser} = require('#utils/joi');
const logger = require('#services/logger');
const {isValidNumber} = require("#helpers/validators");


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
    if (!user.name || !user.email) {
        throw new ValidationError(ErrorCodes.VALIDATION.MISSING_PARAMETERS,
            'User must have name and email to create Odoo user');
    }

    const data = {
        timestamp: fmt(DateTime.utc()),
        name: user.name,
        email: user.email,
        salt: generateSalt(),
    };
    const message = `${data.timestamp}${data.name}${data.email}${data.salt}`;
    data.hash = generateOdooHash(message, ODOO_CONFIG.API_SECRET);

    const response = await odooAuthedAxios.post(ODOO_CONFIG.USER_CREATION_URI, data);
    if (response.status === 201 || response.status === 200) {
        const response_data = response.data;
        const timestamp = response_data['timestamp'];
        const odoo_user_id = response_data['user_id'];
        const odoo_partner_id = response_data['partner_id'];
        const encrypted_key = response_data['key'];
        const key_salt = response_data['key_salt'];
        const hash = response_data['hash'];
        const salt = response_data['salt'];


        // Verify the hash to ensure data integrity
        const message = `${timestamp}${odoo_user_id}${odoo_partner_id}${encrypted_key}${key_salt}${salt}`;
        const calculatedHash = generateOdooHash(message, ODOO_CONFIG.API_SECRET);

        // Compare the calculated hash with the hash received from Odoo
        if (calculatedHash !== hash) {
            logger.error('Hash verification failed', {
                message: message,
                calculatedHash: calculatedHash,
                receivedHash: hash,
            });
            throw new SystemError(ErrorCodes.ODOO.HASH_VERIFICATION_FAILED);
        }

        await db.setUserOdooCredentials(user,
            odoo_user_id,
            odoo_partner_id,
            encrypted_key,
            key_salt,
        );

        logger.verbose('User create in Odoo with ID: ' + odoo_user_id + ' and partner ID: ' + odoo_partner_id);
        await db.recordActivityLog(user.user_id, 'CREATE USER', 'ODOO', user.rfid);
    } else if (response.status === 409) {
        throw new SystemError(ErrorCodes.ODOO.USER_EXISTS);
    } else {
        const errorMSG = response.data['error'] ?? 'Unknown error';
        throw new SystemError(ErrorCodes.ODOO.USER_CREATE_FAILED, errorMSG);
    }
}


/**
 * Generates a secure Odoo portal login INTERNAL_BASE_URL for the given user.
 *
 * - Validates the user object.
 * - Fetches Odoo credentials from the database.
 * - Constructs a login INTERNAL_BASE_URL with required query parameters for authentication.
 * - Throws if credentials are missing or invalid.
 *
 * @async
 * @param {Object} user - User object with odoo_user_id and user_id.
 * @throws {ValidationError} If user or credentials are invalid.
 * @returns {string} Odoo portal login INTERNAL_BASE_URL.
 */
async function getOdooPortalLogin(user) {
    const {error} = fullyQualifiedUserSchema.validate(user);
    if (error) {
        throw new ValidationError(ErrorCodes.VALIDATION.INVALID_FORMAT,
            `Invalid user ${error.message}`);
    }

    const odoo_credentials = await db.getUserOdooCredentials(user.user_id);
    if (!odoo_credentials || !odoo_credentials.key || !odoo_credentials.key_salt) {
        // TODO: Instead of throwing an error, trigger a key rotation process
        throw new ValidationError(ErrorCodes.USER.ODOO_NO_CREDENTIALS);
    }
    const {key, key_salt} = odoo_credentials;
    const _salt = generateSalt();

    // Construct the Odoo portal login INTERNAL_BASE_URL
    // Used INTERNAL_BASE_URL constructor to ensure proper encoding instead of String concatenation
    // We don't use `axiosOdoo` instance here because we only redirect the user to the Odoo with credentials
    const loginUrl = new URL(ODOO_CONFIG.PORTAL_LOGIN_URI, ODOO_CONFIG.EXTERNAL_BASE_URL);

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
    if (!odoo_credentials || !odoo_credentials.key_id || !odoo_credentials.key || !odoo_credentials.key_salt) {
        throw new ValidationError(ErrorCodes.USER.ODOO_NO_CREDENTIALS);
    }

    // Prepare request data using the *current* key and key_salt
    const request_salt = generateSalt();
    const request_timestamp = fmt(DateTime.now());

    // Create a dedicated request object with old credentials
    const requestData = {
        timestamp: request_timestamp,
        user_id: user.odoo_user_id,
        key: odoo_credentials.key, // old key
        key_salt: odoo_credentials.key_salt, // old key_salt
        salt: request_salt,
    };
    try {
        // Generate hash for request data
        const requestMessage = `${requestData.timestamp}${requestData.user_id}${requestData.key}${requestData.key_salt}${requestData.salt}`;
        requestData.hash = generateOdooHash(requestMessage, ODOO_CONFIG.API_SECRET);

        // Send request with the *old* key/key_salt
        // Clone requestData to prevent mutation before Jest matcher evaluates it
        const response = await odooAuthedAxios.post(ODOO_CONFIG.ROTATE_APIKEY_URI, {...requestData});
        if (response.status === 200) {
            const respData = response.data;
            const timestamp = respData['timestamp'];
            const odoo_user_id = respData['user_id'];
            const new_key = respData['key'];
            const new_key_salt = respData['key_salt'];
            const salt = respData['salt'];
            const hash = respData['hash'];

            const message = `${timestamp}${user.odoo_user_id}${new_key}${new_key_salt}${salt}`;
            const expected_hash = generateOdooHash(message, ODOO_CONFIG.API_SECRET);
            // Compare the calculated hash with the hash received from Odoo
            if (expected_hash !== hash) {
                throw new SystemError(ErrorCodes.ODOO.HASH_VERIFICATION_FAILED);
            }

            if (odoo_user_id !== user.odoo_user_id) {
                throw new SystemError(ErrorCodes.USER.ODOO_ID_MISMATCH);
            }

            // Update DB with new key/key_salt
            await db.rotateOdooUserKey(user.user_id, odoo_credentials.key_id, new_key, new_key_salt);

            db.recordActivityLog(user.user_id, 'ROTATE USER KEY', 'ODOO', user.rfid);

            return db.getUserOdooCredentials(user.user_id);
        } else {
            const errorMSG = response.data['error'];
            logger.error(`Error rotating Odoo user key: ${response.status}, ${errorMSG}`);
            throw new SystemError(ErrorCodes.ODOO.KEY_ROTATION_FAILED);
        }
    } catch (error) {
        throw new SystemError(ErrorCodes.ODOO.KEY_ROTATION_FAILED, error.message || 'Unknown error', error);
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
 * @param {Object<db_txn>} db_txn - Transaction object from the database.
 * @returns {Promise<Number>} The created bill ID.
 * @throws {ValidationError|SystemError} On validation or Odoo errors.
 */
async function createOdooTxnInvoice(db_txn) {
    const {error} = qualifiedTransactionSchema.validate(db_txn);
    if (error) {
        throw new ValidationError(ErrorCodes.VALIDATION.INVALID_FORMAT,
            `Invalid transaction ${error.message}`);
    }

    let odoo_credentials = await db.getUserOdooCredentials(db_txn.user_id);
    const odoo_credentials_present = odoo_credentials && odoo_credentials.key && odoo_credentials.key_salt;
    if (!odoo_credentials_present) {
        // await rotateOdooUserAuth(await db.getUserUnique({user_id: db_txn.user_id}));
        // odoo_credentials = await db.getUserOdooCredentials(db_txn.user_id);
        // if (!odoo_credentials) {
        //     throw new ValidationError(ErrorCodes.USER.ODOO_NO_CREDENTIALS);
        // }
        throw new ValidationError(ErrorCodes.USER.ODOO_NO_CREDENTIALS);
    }

    const {key, key_salt} = odoo_credentials;
    const user = await db.getUserUnique({user_id: db_txn.user_id});
    const user_error = fullyQualifiedUserSchema.validate(user);
    if (user_error.error) {
        throw new ValidationError(ErrorCodes.VALIDATION.INVALID_FORMAT,
            `Invalid user: ${user_error.error.message}`);
    }

    // The price of electricity at the time of transaction started
    let txn_started_with_electricity_price;
    txn_started_with_electricity_price = await db.getCurrentElectricityPrice(DateTime.fromJSDate(db_txn.start_timestamp));
    if (!isValidNumber(txn_started_with_electricity_price)) {
        const default_price = 35; //in cents/kwh
        logger.warn(`No price could be found for ${db_txn.start_timestamp.toISOString()}, falling back to default price ${default_price}`);
        txn_started_with_electricity_price = default_price;
    }

    const lines_data = [
        {
            'sku': 'standard_charging',
            // 'uom_name': 'kWh',
            // 'base_price': 0.35,
            'price_unit': txn_started_with_electricity_price / 100,
            'quantity': db_txn.delivered_energy_wh / 1000, // convert Wh to kWh
        },
    ];

    const data = {
        timestamp: fmt(DateTime.utc()),
        user_id: user.odoo_user_id,
        partner_id: user.odoo_partner_id,
        key: key,
        key_salt: key_salt,
        session_start: fmt(DateTime.fromJSDate(db_txn.start_timestamp)),
        session_end: fmt(DateTime.fromJSDate(db_txn.stop_timestamp)),
        lines_data: lines_data,
    };

    const salt = generateSalt();
    data.salt = salt;

    const message = `${data.timestamp}${user.odoo_user_id}${user.odoo_partner_id}${data.session_start}${data.session_end}${data.key}${data.key_salt}${salt}`;
    data.hash = generateOdooHash(message, ODOO_CONFIG.API_SECRET);

    const response = await odooPlainAxios.post(ODOO_CONFIG.INVOICE_CREATION_URI, data);
    const response_data = response.data;
    if (response.status !== 201) {
        const errorMSG = response_data['error'];
        throw new SystemError(ErrorCodes.ODOO.INVOICE_CREATE_FAILED, errorMSG);
    }

    let bill_id = response_data['bill_id'] ? parseInt(response_data['bill_id']) : null;
    if (!bill_id) {
        throw new SystemError(ErrorCodes.ODOO.INVALID_RESPONSE, 'Missing or corrupted bill_id in response.' +
            ' Probably the bill is created in Odoo but needs manual entry for the invoice id', {
            response_data: response_data,
        });
    }

    await db.recordActivityLog(user.user_id, 'CREATE INVOICE', 'ODOO', user.rfid);
    return bill_id;
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
 * @deprecated
 * @param {Object<User>} user - User object with odoo_user_id, odoo_partner_id, and user_id.
 * @returns {Promise<boolean>} True if payment method is valid, false otherwise.
 * @throws {ValidationError|SystemError} On validation or Odoo errors.
 */
async function checkValidPaymentMethod(user) {
    validateUser(user); // throws if invalid

    const odoo_credentials = await db.getUserOdooCredentials(user.user_id);
    const credentials_valid = odoo_credentials && odoo_credentials.key && odoo_credentials.key_salt;
    if (!credentials_valid) {
        throw new ValidationError(ErrorCodes.USER.ODOO_NO_CREDENTIALS);
    }

    const data = {
        timestamp: fmt(DateTime.now()),
        user_id: user.odoo_user_id,
        partner_id: user.odoo_partner_id,
        key: odoo_credentials.key,
        key_salt: odoo_credentials.key_salt,
        salt: generateSalt(),
    };
    const message = `${data.timestamp}${data.user_id}${data.partner_id}${data.key}${data.key_salt}${data.salt}`;
    data.hash = generateOdooHash(message, ODOO_CONFIG.API_SECRET);

    try {
        const response = await odooAuthedAxios.post(ODOO_CONFIG.CHECK_PAYMENT_METHOD_URI, data);
        if (response.status === 200) {
            const response_data = response.data;
            const timestamp = response_data['timestamp'];
            const result = response_data['result']; // 1 for valid, 0 for invalid
            const salt = response_data['salt'];
            const hash = response_data['hash'];

            if (!timestamp || !salt || !hash || result === undefined || result === null) {
                throw new ResponseError(ErrorCodes.ODOO.INVALID_RESPONSE);
            }

            // Verify hash
            const message = `${timestamp}${result}${salt}`;
            const expected_hash = generateOdooHash(message, ODOO_CONFIG.API_SECRET);
            if (expected_hash !== hash) {
                throw new ResponseError(ErrorCodes.ODOO.HASH_VERIFICATION_FAILED);
            }

            return (result === 1);
        } else {
            logger.error(`Error checking payment method: ${response.status}, json: ${JSON.stringify(response.data)}`);
            throw new SystemError(ErrorCodes.ODOO.PAYMENT_METHOD_VALIDITY_CHECK_FAILED);
        }
    } catch (error) {
        logger.error(`Failed to check payment method: ${error.message}`);
        throw new SystemError(ErrorCodes.SYSTEM.PAYMENT_METHOD_VALIDITY_CHECK_FAILED, error.message || 'Unknown error', error);
    }
}


module.exports = {
    createOdooUser,
    getOdooPortalLogin,
    rotateOdooUserAuth,
    createOdooTxnInvoice,
    checkValidPaymentMethod,
};