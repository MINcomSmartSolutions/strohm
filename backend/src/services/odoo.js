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
    odooTxnProcessResponseSchema
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
    // We don't use `axiosOdoo` instance here because we redirect the user to the Odoo with credentials externally
    const loginUrl = new URL(ODOO_CONFIG.PORTAL_LOGIN_URI, ODOO_CONFIG.EXTERNAL_BASE_URL);

    let timestamp = DateTime.utc().toISO();
    // One thing to note here: user.odoo_user_id is not sent or received in parameters. Without it hash would fail and login would be rejected.
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
 * Sends the txn to odoo for processing. Creating sales or invoice is its responsibility.
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
 *     - session_backend_ref (int): Steve txn ID for the transaction.
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
async function sendTxnToOdooProcessing(db_txn) {
    // TODO: Needs refactoring, function seperation
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
    const {
        price_eur_kwh: txn_started_with_electricity_price_eur_kwh,
    } = await db.getElectricityPriceOrDefault(DateTime.fromJSDate(db_txn.start_timestamp));

    const lines_data = [
        {
            'sku': 'standard_charging',
            'session_start': DateTime.fromJSDate(db_txn.start_timestamp).toISO(),
            'session_end': DateTime.fromJSDate(db_txn.stop_timestamp).toISO(),
            'session_backend_ref': db_txn.txn_steve_id,
            // 'uom_name': 'kWh',
            // 'base_price': 0.35,
            'price_unit': txn_started_with_electricity_price_eur_kwh, // Should be NETTO in euros per kWh!
            'quantity': db_txn.delivered_energy_wh / 1000, // convert Wh to kWh
        },
    ];

    const data = {
        timestamp: DateTime.utc().toISO(),
        lines_data: lines_data,
        key: key,
        key_salt: key_salt,
    };

    const salt = generateSalt();
    data.salt = salt;

    const message = `${data.timestamp}${user.odoo_user_id}${user.odoo_partner_id}${data.key}${data.key_salt}${salt}`;
    data.hash = generateOdooHash(message, ODOO_CONFIG.API_SECRET);

    const response = await odooPlainAxios.post(ODOO_CONFIG.TXN_PROCESS_URI, data);
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
    const {error: validationError} = odooTxnProcessResponseSchema.validate(response_data);
    if (validationError) {
        throw new SystemError(ErrorCodes.ODOO.INVALID_RESPONSE,
            `Invalid invoice/sale order creation details: ${validationError.message}`, {
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
        qty: order.qty,
        unit_price: order.unit_price ?? txn_started_with_electricity_price_eur_kwh,
        total_amount: order.total_amount,
        billed: order.invoice || false,
    });

    let db_created_invoice = null;

    // Create invoice record if invoice was created by Odoo
    if (invoice && invoice.id) {
        db_created_invoice = await db.upsertTxnOdooInvoice(
            invoice.id, {
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


module.exports = {
    createOdooUser,
    getOdooPortalLogin,
    rotateOdooUserAuth,
    sendTxnToOdooProcessing,
};