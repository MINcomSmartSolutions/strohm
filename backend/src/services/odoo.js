/**
 * @file Odoo Integration Service
 *
 * It is responsible for user creation, login, key rotation, and invoicing with Odoo via REST API.
 *
 * @module services/odoo
 */
const {DateTime} = require('luxon');
const {ODOO_CONFIG} = require('#config');

const {ValidationError, ErrorCodes, SystemError, ResponseError} = require('#utils/errors');
const {db} = require('#utils/queries');
const {generateOdooHash, generateSalt} = require('#helpers/auth');
const {odooAuthedAxios, odooPlainAxios} = require('./network');
const {
    qualifiedTransactionSchema,
    fullyQualifiedUserSchema,
    validateUser,
    invoiceCreationResponseSchema
} = require('#utils/joi');
const logger = require('#services/logger');


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
        timestamp: DateTime.utc().toISO(),
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

    // Construct the Odoo portal login
    // Used URL constructor to ensure proper encoding instead of String concatenation
    // We don't use `axiosOdoo` instance here because we only redirect the user to the Odoo with credentials externally
    const loginUrl = new URL(ODOO_CONFIG.PORTAL_LOGIN_URI, ODOO_CONFIG.EXTERNAL_BASE_URL);

    let timestamp = DateTime.utc().toISO();
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
    const request_timestamp = DateTime.utc().toISO();

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
 * Creates a sale order (and optionally invoice) in Odoo for a given transaction.
 *
 * Request payload to Odoo:
 *   partner_id (int): ID of the sale/customer (`res.partner`).
 *   lines_data (list[dict]): Invoice line data dict with the following fields:
 *     - name (str): Product name.
 *     - sku (str): Internal reference for product.
 *     - uom_name (str): Unit of measure name (e.g., "kWh"; only "kWh" accepted for now).
 *     - base_price (float): Standard list price for product (e.g., 0.35).
 *     - custom_rate (float): Actual invoice price (e.g., 0.38).
 *     - quantity (float): Consumed quantity (e.g., 150, in kWh).
 *     - session_start (datetime): Session start datetime in ISO.
 *     - session_end (datetime): Session end datetime in ISO.
 *     - session_backend_ref (int): Backend db ID for the transaction.
 *     // TODO: Add more fields if needed. e.g. payment terms, bill_date etc.
 *
 * - Validates the transaction object.
 * - Fetches Odoo credentials for the user.
 * - Prepares invoice line data.
 * - Sends a POST request to Odoo to create the order/invoice.
 * - Stores order and invoice (if created) in local database.
 * - Links them via junction table for consolidated billing support.
 *
 * @async
 * @param {Object<db_txn>} db_txn - Transaction object from the database.
 * @returns {Promise<Object>} Object containing {order_id, odoo_order_id, invoice_id, odoo_invoice_id}
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
    const txn_started_with_electricity_price = await db.getElectricityPriceOrDefault(DateTime.fromJSDate(db_txn.start_timestamp));
    const unit_price_eur = txn_started_with_electricity_price.price_ct_kwh / 100; // convert cts to €

    const lines_data = [
        {
            'sku': 'standard_charging',
            'session_start': DateTime.fromJSDate(db_txn.start_timestamp).toISO(),
            'session_end': DateTime.fromJSDate(db_txn.stop_timestamp).toISO(),
            'session_backend_ref': db_txn.id,
            // 'uom_name': 'kWh',
            // 'base_price': 0.35,
            'price_unit': unit_price_eur, // convert cts to €
            'quantity': db_txn.delivered_energy_wh / 1000, // convert Wh to kWh
        },
    ];

    const data = {
        timestamp: DateTime.utc().toISO(),
        user_id: user.odoo_user_id,
        partner_id: user.odoo_partner_id,
        lines_data: lines_data,
        key: key,
        key_salt: key_salt,
    };

    const salt = generateSalt();
    data.salt = salt;

    const message = `${data.timestamp}${user.odoo_user_id}${user.odoo_partner_id}${data.key}${data.key_salt}${salt}`;
    data.hash = generateOdooHash(message, ODOO_CONFIG.API_SECRET);

    const response = await odooPlainAxios.post(ODOO_CONFIG.INVOICE_CREATION_URI, data);
    const response_data = response.data;
    if (response.status !== 201) {
        const errorMSG = response_data['error'];
        throw new SystemError(ErrorCodes.ODOO.INVOICE_CREATE_FAILED, errorMSG);
    }

    let details = response_data['details'];
    if (!details) {
        throw new SystemError(ErrorCodes.ODOO.INVALID_RESPONSE, {
            response_data: response_data,
        });
    }
    const {error: validationError} = invoiceCreationResponseSchema.validate(response_data);
    if (validationError) {
        throw new SystemError(ErrorCodes.ODOO.INVALID_RESPONSE,
            `Invalid invoice creation details: ${validationError.message}`, {
                response_data: response_data,
            });
    }

    const order = details.sale_order;
    const invoice = details.invoice || null;

    // TODO: Check if `unit_price` from Odoo matches sent `unit_price_eur`
    // TODO: Check if `qty` from Odoo matches sent `quantity`

    // Create order record
    const db_created_order = await db.upsertTxnOdooOrder(db_txn.id, {
        odoo_saleorder_id: order.id,
        odoo_saleorder_name: order.name,
        confirmed: order.confirmed || true,
        qty: order.qty || null,
        unit_price: unit_price_eur,
        total_amount: order.total_amount || null,
        billed: order.invoice || false,
    });

    let db_created_invoice = null;

    // Create invoice record if invoice was created by Odoo
    if (invoice && invoice.id) {
        db_created_invoice = await db.upsertTxnOdooInvoice({
            odoo_invoice_id: invoice.id,
            odoo_invoice_name: invoice.name || null,
            total_amount: invoice.total_amount || null,
            paid: invoice.paid || false,
        });

        // Link order to invoice
        await db.linkOrderToInvoice(db_created_order.id, db_created_invoice.id);
    }

    logger.verbose(`Created Odoo order ${order.id} for transaction ${db_txn.id}` +
        (invoice ? ` with invoice ${invoice.id}` : ''));

    return {
        order_id: db_created_order.id,
        odoo_order_id: order.id,
        invoice_id: db_created_invoice?.id || null,
        odoo_invoice_id: invoice?.id || null,
    };
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
        timestamp: DateTime.now().toISO(),
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