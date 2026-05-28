'use strict';
/**
 * @file Global database queries
 *
 * @module utils/queries
 */


const logger = require('#services/logger');
const pool = require('#services/db_conn');
const {DatabaseError, ErrorCodes, ValidationError} = require('./errors');
const {DateTime} = require('luxon');
const {steveTransactionSchema} = require('./joi');
const {qualifiedTransactionSchema} = require('#utils/joi');
const {isValidNumber, isValidInteger} = require("#helpers/validators");
const {GLOBAL_CONFIG} = require("#config");

/**
 * Normalizes RFID tags to uppercase for consistent storage and comparison.
 * RFIDs may come in different cases from different sources (SteVe, OIDC, etc.)
 *
 * @param {string} rfid - The RFID tag to normalize
 * @returns {string} Normalized RFID in uppercase
 */
function normalizeRFID(rfid) {
    if (!rfid) return rfid;
    return rfid.trim().toUpperCase();
}

/**
 * Handles query errors.
 *
 * @param {Error} error - The error object.
 * @param {string} operation - The operation being performed.
 * @param  {boolean} silent=false - If true, logs the error but does not throw.
 * @throws {Error} - The error that happened during the operation.
 */
const handleQueryError = (error, operation, silent = false) => {
    logger.error(`Error during ${operation} operation:`, error);
    if (silent) {
        return;
    }
    throw new DatabaseError(
        ErrorCodes.DATABASE.QUERY_ERROR,
        `Error during ${operation} operation.`,
        error,
    );
};


const createUser = async (oauth_id, name, email, rfid) => {
    //Only req.oidc can be provided

    const inputsValid = ![oauth_id, name, email, rfid].some(param => !param || param === '');
    if (!inputsValid) {
        throw new ValidationError(ErrorCodes.VALIDATION.MISSING_PARAMETERS, {
                'user': {
                    'oauth_id': oauth_id,
                    'name': name,
                    'email': email,
                    'rfid': rfid,
                },
            },
        );
    }

    // Normalize RFID to uppercase for consistency
    const normalizedRFID = normalizeRFID(rfid);

    const query = `
        INSERT INTO users (oauth_id, name, email, rfid)
        VALUES ($1, $2, $3::varchar, $4)
        RETURNING *
    `;
    const values = [oauth_id, name, email, normalizedRFID];

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(query, values);
        const created_user = result.rows[0];
        await client.query('COMMIT');

        // Since recordActivityLog is now async, await it
        await recordActivityLog(created_user.user_id, 'CREATE USER', 'DB', normalizedRFID);
        return created_user;
    } catch (error) {
        await client.query('ROLLBACK');
        handleQueryError(error, 'createUser');
    } finally {
        client.release();
    }
};

/**
 * Gets users based on dynamic filter parameters.
 *
 * @async
 * @param {Object} filters - Object containing field names and values to filter by
 * @param {Object} options - Additional query options (limit, offset, orderBy, etc.)
 * @returns {Promise<Array>} - The matching users
 * @throws {DatabaseError} - If the database operation fails
 */
const getUsers = async (filters = {}, options = {}) => {

    // Start building the query
    let query = 'SELECT * FROM users';
    const values = [];
    let paramIndex = 1;

    // Add WHERE clauses for each filter
    if (Object.keys(filters).length > 0) {
        const whereClauses = [];

        for (const [field, value] of Object.entries(filters)) {
            if (value === null) {
                whereClauses.push(`${field} IS NULL`);
            } else {
                whereClauses.push(`${field} = $${paramIndex}`);
                values.push(value);
                paramIndex++;
            }
        }

        if (whereClauses.length > 0) {
            query += ` WHERE ${whereClauses.join(' AND ')}`;
        }
    }

    // Add ORDER BY, LIMIT, OFFSET if provided in options
    if (options) {
        if (options.orderBy) {
            // whitelist of allowed column names
            const allowedColumns = [
                'user_id',
                'oauth_id',
                'name',
                'email',
                'rfid',
                'odoo_user_id',
                'odoo_partner_id',
                'steve_id',
                'created_at',
                'updated_at',
            ];

            // Validate that the orderBy parameter is in the whitelist
            if (!allowedColumns.includes(options.orderBy)) {
                throw new ValidationError(
                    ErrorCodes.VALIDATION.INVALID_PARAMETERS,
                    `Invalid orderBy parameter: ${options.orderBy}`,
                );
            }

            const direction = options.orderDirection?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
            query += ` ORDER BY ${options.orderBy} ${direction}`;
        }

        if (options.limit) {
            query += ` LIMIT $${paramIndex}`;
            values.push(options.limit);
            paramIndex++;
        }

        if (options.offset) {
            query += ` OFFSET $${paramIndex}`;
            values.push(options.offset);
            paramIndex++;
        }
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(query, values);
        await client.query('COMMIT');
        return result.rows; // rowCount?
    } catch (error) {
        await client.query('ROLLBACK');
        handleQueryError(error, 'getUsers');
    } finally {
        client.release();
    }
};


/**
 * Gets a single user with uniqueness validation.
 * Throws an error if multiple users match the criteria.
 *
 * @async
 * @param {Object} filters - Object containing field names and values to filter by
 * @returns {Promise<User|null>} - The matching user or null if not found
 * @throws {DatabaseError} - database operation fails
 * @throws {ValidationError} - if multiple users match the criteria
 */
const getUserUnique = async (filters) => {
    if (!filters || typeof filters !== 'object' || Object.keys(filters).length === 0) {
        throw new ValidationError(
            ErrorCodes.VALIDATION.MISSING_PARAMETERS, {filters},
        );
    }
    const users = await getUsers(filters, {limit: 2});

    if (users.length > 1) {
        logger.warn(`Multiple users found for filters: ${JSON.stringify(filters)}`);
        throw new ValidationError(
            ErrorCodes.VALIDATION.ASK_RETURN_DISCREPANCY,
            `Multiple users match the criteria, expected unique result.`,
        );
    }
    if (users.length === 0) {
        return null; // No user found
    }

    // Return the users details
    return users[0];
};


/**
 * Sets Odoo credentials for a user in the database.
 * Updates the users table with Odoo IDs and stores encrypted API key information.
 *
 * @async
 * @param {Object} user - User object containing user_id
 * @param {number} odoo_user_id - Odoo system user ID
 * @param {number} odoo_partner_id - Odoo system partner ID
 * @param {string} encrypted_key - Encrypted Odoo API key
 * @param {string} salt - Salt used for key encryption
 * @returns {Promise<number>} - The ID of the inserted API key record
 * @throws {ValidationError} - If parameters are missing or invalid
 * @throws {DatabaseError} - If database operations fail
 */
const setUserOdooCredentials = async (user, odoo_user_id, odoo_partner_id, encrypted_key, salt) => {
    const inputsValid = ![user, odoo_user_id, odoo_partner_id, encrypted_key, salt].some(param => !param || param === '');
    const inputsAreIntegers = user && [user.user_id, odoo_user_id, odoo_partner_id].every(Number.isSafeInteger);

    if (!inputsValid || !inputsAreIntegers) {
        throw new ValidationError(
            ErrorCodes.VALIDATION.MISSING_PARAMETERS,
        );
    }

    const userTableQuery = `
        UPDATE users
        SET odoo_user_id    = $1::integer,
            odoo_partner_id = $2::integer
        WHERE user_id = $3::integer
    `;

    const odooUserKeyQuery = `
        INSERT INTO odoo_apikeys (user_id, key, salt)
        VALUES ($1::integer, $2::varchar, $3::varchar)
        RETURNING id
    `;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(userTableQuery, [odoo_user_id, odoo_partner_id, user.user_id]);
        const key_id = await client.query(odooUserKeyQuery, [user.user_id, encrypted_key, salt]);
        if (key_id.rowCount === 0) {
            throw new ValidationError(
                ErrorCodes.USER.ODOO_NO_CREDENTIALS,
                `Failed to insert Odoo API key for user ID ${user.user_id}.`,
            );
        }
        await client.query('COMMIT');
        return key_id.rows[0].id; // Return the inserted key ID
    } catch (error) {
        await client.query('ROLLBACK');
        handleQueryError(error, 'setUserOdooCredentials');
    } finally {
        client.release();
    }
};


/**
 * Retrieves the latest valid Odoo API key credentials for a user.
 * Returns null if no credentials are found.
 *
 * @async
 * @param {number} user_id - The user's ID.
 * @returns {Promise<Object|null>} The credentials object or null.
 * @throws {ValidationError|DatabaseError} On missing parameters or query error.
 */
const getUserOdooCredentials = async (user_id) => {
    if (!user_id || !Number.isSafeInteger(user_id)) {
        throw new ValidationError(
            ErrorCodes.VALIDATION.MISSING_PARAMETERS,
        );
    }

    const query = `
        SELECT id as key_id, key, salt as key_salt
        FROM users
                 JOIN odoo_apikeys ON users.user_id = odoo_apikeys.user_id
        WHERE users.user_id = $1::integer
          AND revoked_at IS NULL
        ORDER BY odoo_apikeys.created_at DESC
        LIMIT 1
    `;

    const client = await pool.connect();
    try {
        const result = await client.query(query, [user_id]);

        if (result.rows.length === 0) {
            return null; // No valid credentials found
        }

        return result.rows[0];
    } catch (error) {
        handleQueryError(error, 'getUserOdooCredentials');
    } finally {
        client.release();
    }
};


/**
 * Rotates a user's Odoo API key.
 * Revokes the old key and inserts a new one for the user.
 *
 * @async
 * @param {number} user_id - The user's ID.
 * @param {number} old_key_id - The ID of the old API key to revoke.
 * @param {string} new_key - The new API key.
 * @param {string} new_key_salt - The salt for the new API key.
 * @returns {Promise<boolean>} True if rotation is successful.
 * @throws {ValidationError|DatabaseError} On missing parameters or DB error.
 */
const rotateOdooUserKey = async (user_id, old_key_id, new_key, new_key_salt) => {
    const inputsValid = ![user_id, old_key_id, new_key, new_key_salt].some(param => !param || param === '');
    const inputsAreIntegers = [user_id, old_key_id].every(Number.isSafeInteger);

    if (!inputsValid || !inputsAreIntegers) {
        throw new ValidationError(
            ErrorCodes.VALIDATION.MISSING_PARAMETERS,
        );
    }

    const query = `
        UPDATE odoo_apikeys
        SET revoked_at = current_timestamp
        WHERE user_id = $1::integer
          AND id = $2::integer
          AND revoked_at IS NULL
    `;

    const insertQuery = `
        INSERT INTO odoo_apikeys (user_id, key, salt)
        VALUES ($1::integer, $2::varchar, $3::varchar)
    `;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const result = await client.query(query, [user_id, old_key_id]);
        if (result.rowCount === 0) {
            throw new ValidationError(
                ErrorCodes.USER.ODOO_NO_CREDENTIALS,
                `${user_id}'s old key is already revoked or does not exist. Cannot rotate key. Request a new one.`,
            );
        }

        const insertResult = await client.query(insertQuery, [user_id, new_key, new_key_salt]);
        if (insertResult.rowCount === 0) {
            throw new ValidationError(
                ErrorCodes.USER.ODOO_NO_CREDENTIALS,
                `Failed to insert new key for user ID ${user_id}.`,
            );
        }
        await client.query('COMMIT');
        return true; // Rotation successful
    } catch (error) {
        await client.query('ROLLBACK');
        handleQueryError(error, 'rotateOdooUserKey');
    } finally {
        client.release();
    }
};


/**
 * Sets the SteVe user ID for a user in the database.
 *
 * @async
 * @param {Object} user - The user object (must include user_id).
 * @param {number} steve_id - The SteVe user ID to set.
 * @throws {ValidationError} If required parameters are missing.
 * @throws {Error} If the update fails.
 * @returns {Promise<Object|undefined>} The updated user row or undefined.
 */
const setSteveUserParamaters = async (user, steve_id) => {
    if (!user || !user.user_id || !steve_id) {
        throw new ValidationError(
            ErrorCodes.VALIDATION.MISSING_PARAMETERS,
        );
    }

    const update_query = `
        UPDATE users
        SET steve_id = $1::integer
        WHERE user_id = $2::integer
    `;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(update_query, [steve_id, user.user_id]);
        if (result.rowCount === 0) {
            throw new Error('Could not set user parameters');
        }
        await client.query('COMMIT');
        return result.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        handleQueryError(error, 'setSteveUserParamaters');
    } finally {
        client.release();
    }
};


/**
 * Records an activity event for a user in the activity log.
 *
 * @param {number|null} user_id - The user's ID.
 * @param {string} event_type - The type of event (e.g., 'CREATE', 'BLOCK').
 * @param {string} target - The target system or entity (e.g., 'DB', 'SteVe').
 * @param {string} rfid - The user's RFID.
 * @param {string|null} reason=null - Optional reason for the event.
 * @returns {Promise<void>}
 */
async function recordActivityLog(user_id, event_type, target, rfid, reason = null) {
    // If user_id is null or undefined, don't attempt to insert a record
    // This prevents foreign key constraint violations in the db
    if (!user_id) {
        logger.warn(`Attempted to record activity log without valid user_id: ${event_type}, ${target}, ${rfid}`);
        return;
    }

    // Validate required parameters
    if (!event_type || !target || !rfid) {
        logger.error(`Attempted to record activity log with missing required parameters: ${event_type}, ${target}, ${rfid}`);
        return;
    }

    let activity_log_query = `
        INSERT INTO activity_log (user_id, event_type, target, rfid)
        VALUES ($1, $2, $3::varchar, $4)
    `;
    let values = [user_id, event_type, target, rfid];

    if (reason) {
        activity_log_query = `
            INSERT INTO activity_log (user_id, event_type, target, rfid, reason)
            VALUES ($1, $2, $3::varchar, $4, $5::varchar)
        `;
        values = [user_id, event_type, target, rfid, reason];
    }

    const client = await pool.connect();
    try {
        logger.info(`Recording activity log: user_id=${user_id}, event_type=${event_type}, target=${target}, rfid=${rfid}, reason=${reason || 'N/A'}`);
        await client.query('BEGIN');
        await client.query(activity_log_query, values);
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        handleQueryError(error, 'recordActivityLog', true);
    } finally {
        client.release();
    }
}


/**
 * Cross-check user by steve_id and validate RFID consistency
 * @async
 * @param {Object} client - Database client
 * @param {number} ocppTagPk - Steve user ID
 * @param {string} ocppIdTag - RFID tag from transaction
 * @param {number} txn_steve_id - Transaction Steve ID for logging
 * @returns {Promise<number|null>} - user_id if found, null otherwise
 */
async function userCrossCheckForTxn(client, ocppTagPk, ocppIdTag, txn_steve_id) {
    const userLookupQuery = `
        SELECT user_id, rfid
        FROM users
        WHERE steve_id = $1::integer
    `;

    const userLookupResult = await client.query(userLookupQuery, [ocppTagPk]);

    if (userLookupResult.rowCount > 0) {
        const user = userLookupResult.rows[0];

        // Cross-check RFID to detect data inconsistencies (case-insensitive comparison)
        if (user.rfid.toLowerCase() !== ocppIdTag.toLowerCase()) {
            logger.warn(`RFID mismatch for steve_id ${ocppTagPk}: Database has '${user.rfid}' but transaction has '${ocppIdTag}'`, {
                steve_id: ocppTagPk,
                db_rfid: user.rfid,
                txn_rfid: ocppIdTag,
                txn_steve_id: txn_steve_id,
                user_id: user.user_id,
            });
        }

        return user.user_id;
    } else {
        logger.warn(`Unknown user's transaction is received. User not found.`, {
            ocppTagPk: ocppTagPk,
            ocppIdTag: ocppIdTag,
            txn_steve_id: txn_steve_id,
        });
        return null;
    }
}


/**
 * Record a transaction record into the `charging_transactions` table.
 * If transaction already exists and is complete, returns it without modification.
 * Otherwise, inserts a new record with proper user association or updates existing one.
 *
 * @async
 * @param {Object<steve_txn>} steve_txn - Transaction from Steve system
 * @returns {Promise<Object<db_txn>>} db_txn - The transaction record from database
 */
async function recordSteveTxn(steve_txn) {
    const {error} = steveTransactionSchema.validate(steve_txn);
    if (error) {
        throw new ValidationError(
            ErrorCodes.VALIDATION.INVALID_PARAMETERS,
            `Invalid transaction data: ${error.message}`,
        );
    }

    const client = await pool.connect();
    try {
        logger.verbose(`Recording transaction from Steve ID: ${steve_txn.id}`);
        await client.query('BEGIN');

        // First check if transaction already exists in our database
        const existingTxnQuery = `
            SELECT *
            FROM charging_transactions
            WHERE txn_steve_id = $1::integer
            LIMIT 1
        `;

        const existingTxnResult = await client.query(existingTxnQuery, [steve_txn.id]);

        // If transaction exists, check if it's complete or needs updating
        if (existingTxnResult.rows.length > 0) {
            const existing_txn = existingTxnResult.rows[0];
            const existing_txn_stop_datetime = existing_txn.stop_timestamp ? DateTime.fromJSDate(existing_txn.stop_timestamp).toUTC() : null;
            const incoming_txn_stop_datetime = steve_txn.stopTimestamp ? DateTime.fromISO(steve_txn.stopTimestamp).toUTC() : null;

            // If both existing and incoming transactions have stop timestamps, transaction is complete
            if ((incoming_txn_stop_datetime && existing_txn_stop_datetime) && (incoming_txn_stop_datetime.equals(existing_txn_stop_datetime))) {
                logger.verbose(`Transaction of Steve ID: ${steve_txn.id} already exists and is complete - returning existing record`);
                await client.query('COMMIT');
                return existing_txn;
            }

            // Transaction exists but needs updating (adding stop values to an ongoing transaction)
            logger.verbose(`Updating existing transaction ${existing_txn.id} (Steve txn ID: ${steve_txn.id})`);
            logger.verbose(`Changes: stop_timestamp: ${existing_txn.stop_timestamp} -> ${steve_txn.stopTimestamp}, stop_value: ${existing_txn.stop_value} -> ${steve_txn.stopValue}, stop_reason: ${existing_txn.stop_reason} -> ${steve_txn.stopReason}`);

            // Try to resolve user_id if it's currently NULL (in case user was registered after transaction started)
            let resolved_user_id = existing_txn.user_id;
            if (!resolved_user_id) {
                resolved_user_id = await userCrossCheckForTxn(client, steve_txn.ocppTagPk, steve_txn.ocppIdTag, steve_txn.id);
                if (resolved_user_id) {
                    logger.info(`Resolved user_id ${resolved_user_id} for previously unknown transaction ${steve_txn.id}`);
                }
            }

            // Update stop-related fields and user_id (if resolved)
            const updateQuery = `
                UPDATE charging_transactions
                SET stop_timestamp   = $1,
                    stop_value       = $2::numeric,
                    stop_reason      = $3::varchar,
                    stop_event_actor = $4::varchar,
                    chargebox_pk     = $5::integer,
                    connector_id     = $6,
                    user_id          = $7
                WHERE txn_steve_id = $8::integer
                RETURNING *
            `;

            const updateValues = [
                steve_txn.stopTimestamp,
                steve_txn.stopValue,
                steve_txn.stopReason,
                steve_txn.stopEventActor,
                steve_txn.chargeBoxPk,
                steve_txn.connectorId,
                resolved_user_id,
                steve_txn.id,
            ];

            const updateResult = await client.query(updateQuery, updateValues);
            await client.query('COMMIT');
            logger.verbose(`Transaction ${steve_txn.id} updated successfully`);
            return updateResult.rows[0];
        }

        // Transaction doesn't exist, proceed to insert
        // Look up user by steve_id and validate RFID consistency
        const user_id = await userCrossCheckForTxn(client, steve_txn.ocppTagPk, steve_txn.ocppIdTag, steve_txn.id);

        const insertQuery = `INSERT INTO charging_transactions
                             (txn_steve_id,
                              ocpp_id_tag,
                              start_timestamp,
                              stop_timestamp,
                              start_value,
                              stop_value,
                              stop_reason,
                              stop_event_actor,
                              chargebox_pk,
                              connector_id,
                              user_id)
                             VALUES ($1::integer,
                                     $2,
                                     $3,
                                     $4,
                                     $5::numeric,
                                     $6::numeric,
                                     $7::varchar,
                                     $8::varchar,
                                     $9::integer,
                                     $10,
                                     $11::integer)
                             RETURNING *`;

        const values = [
            steve_txn.id,
            steve_txn.ocppIdTag,
            steve_txn.startTimestamp,
            steve_txn.stopTimestamp,
            steve_txn.startValue,
            steve_txn.stopValue,
            steve_txn.stopReason,
            steve_txn.stopEventActor,
            steve_txn.chargeBoxPk,
            steve_txn.connectorId,
            user_id,
        ];

        const result = await client.query(insertQuery, values);
        await client.query('COMMIT');
        logger.verbose(`New transaction ${steve_txn.id} inserted successfully`);
        return result.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        handleQueryError(error, 'recordTransaction');
    } finally {
        client.release();
    }
}


/**
 * Updates the `invoice_ref` field for a transaction in `charging_transactions`.
 * This is used to link a transaction to an invoice in Odoo.
 *
 * @deprecated Use upsertTxnOdooOrder() and linkOrderToInvoice() instead.
 * This function is kept for backward compatibility only.
 * The invoice_ref column is being deprecated in favor of the odoo_txn_orders/odoo_invoices tables.
 *
 * @async
 * @param {Object<db_txn>} txn - The transaction object
 * @param {number} invoice_id - The invoice ID came from Odoo to set.
 * @returns {Promise<void>}
 * @throws {DatabaseError|ValidationError} On query error.
 */
async function saveInvoiceId(txn, invoice_id) {
    const {error} = qualifiedTransactionSchema.validate(txn);
    if (error) {
        throw new ValidationError(ErrorCodes.VALIDATION.INVALID_FORMAT, `Invalid transaction format`, error);
    }

    const query = `
        UPDATE charging_transactions
        SET invoice_ref = $1::integer
        WHERE id = $2::integer
    `;
    const values = [invoice_id, txn.id];

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(query, values);
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        handleQueryError(error, 'saveInvoiceId');
    } finally {
        client.release();
    }
}

/**
 * Retrieves a transaction by its Steve ID.
 *
 * @async
 * @param {number} steve_txn_id - The transaction Steve ID
 * @returns {Promise<Object|null>} The transaction object or null if not found
 */
async function getTransactionBySteveTxnId(steve_txn_id) {
    if (!isValidInteger(steve_txn_id)) {
        throw new ValidationError(
            ErrorCodes.VALIDATION.MISSING_PARAMETERS,
            'steve_txn_id is required and must be a valid integer',
        );
    }
    const query = `
        SELECT *
        FROM charging_transactions
        WHERE txn_steve_id = $1::integer
    `;

    const client = await pool.connect();
    try {
        const result = await client.query(query, [steve_txn_id]);
        return result.rows[0] || null;
    } catch (error) {
        handleQueryError(error, 'getTransactionBySteveTxnId');
    } finally {
        client.release();
    }
}

// ====================================================================================
// ODOO TRANSACTION INTEGRATION
// ====================================================================================
/**
 * Functions for managing Odoo sale orders and invoices linked to charging transactions.
 *
 * STRUCTURE:
 * - odoo_txn_orders: Sale orders (one per charging transaction)
 * - odoo_invoices: Invoices (can contain multiple orders - consolidated billing)
 * - odoo_order_invoice_link: Junction table linking orders to invoices
 *
 * TYPICAL WORKFLOW:
 *
 * 1. Create Order:
 *    const order = await upsertTxnOdooOrder(txn_id, {
 *        odoo_saleorder_id: 456,
 *        odoo_saleorder_name: 'S00001',
 *        qty: 10.5,
 *        unit_price: 0.30,
 *        total_amount: 3.15
 *    });
 *
 * 2. Update Order Status:
 *    await updateTxnOdooOrder(456, { billed: true });
 *
 * 3. Create Invoice (for single or multiple orders):
 *    const invoice = await upsertTxnOdooInvoice({
 *        odoo_invoice_id: 789,
 *        odoo_invoice_name: 'INV/2025/0001',
 *        total_amount: 3.15
 *    });
 *
 * 4. Link Order(s) to Invoice:
 *    // Single order
 *    const invoiceId = await getInvoiceIdByOdooInvoiceId(789);
 *    await linkOrderToInvoice(order.id, invoiceId);
 *
 *    // Multiple orders (consolidated billing)
 *    await linkOrderToInvoice([orderId1, orderId2, orderId3], invoiceId);
 *
 * 5. Update Invoice Status:
 *    await updateTxnOdooInvoice(789, { paid: true });
 *
 * 6. Query Details:
 *    const details = await getTxnOdooDetails(txn_id);
 *    const orders = await getOrdersByInvoiceId(invoiceId);
 */

/**
 * Creates or updates a sale order record linked to a charging transaction.
 * If odoo_saleorder_id already exists, updates the existing record by the txn_id
 *
 * @async
 * @param {number} txn_id - The charging transaction ID (required for insert)
 * @param {Object} orderDetails - The order details
 * @param {number} orderDetails.odoo_saleorder_id - The Odoo sale order ID
 * @param {string} [orderDetails.odoo_saleorder_name] - The Odoo sale order name (e.g., 'S00001')
 * @param {number} [orderDetails.qty] - Quantity in kWh
 * @param {number} [orderDetails.unit_price] - Unit price per kWh in euros
 * @param {number} [orderDetails.total_amount] - Total amount for the order
 * @param {boolean} [orderDetails.confirmed] - Whether the order is confirmed
 * @param {boolean} [orderDetails.billed] - Whether the order has been billed
 * @param {boolean} [orderDetails.cancelled] - Whether the order is cancelled
 * @returns {Promise<db_odoo_txn_order>} The upserted order record
 */
async function upsertTxnOdooOrder(txn_id, orderDetails) {
    const {
        odoo_saleorder_id,
        odoo_saleorder_name,
        qty,
        unit_price,
        total_amount,
        confirmed,
        billed,
        cancelled
    } = orderDetails;

    if (!odoo_saleorder_id) {
        throw new ValidationError(ErrorCodes.VALIDATION.MISSING_PARAMETERS, 'odoo_saleorder_id is required');
    }

    const query = `
        INSERT INTO odoo_txn_orders (txn_id, odoo_saleorder_id, odoo_saleorder_name, qty, unit_price, total_amount,
                                     confirmed, billed, cancelled)
        VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, true), COALESCE($8, false), COALESCE($9, false))
        ON CONFLICT (odoo_saleorder_id) DO UPDATE SET odoo_saleorder_name = COALESCE(EXCLUDED.odoo_saleorder_name,
                                                                                     odoo_txn_orders.odoo_saleorder_name),
                                                      qty                 = COALESCE(EXCLUDED.qty, odoo_txn_orders.qty),
                                                      unit_price          = COALESCE(EXCLUDED.unit_price, odoo_txn_orders.unit_price),
                                                      total_amount        = COALESCE(EXCLUDED.total_amount, odoo_txn_orders.total_amount),
                                                      confirmed           = COALESCE(EXCLUDED.confirmed, odoo_txn_orders.confirmed),
                                                      billed              = COALESCE(EXCLUDED.billed, odoo_txn_orders.billed),
                                                      cancelled           = COALESCE(EXCLUDED.cancelled, odoo_txn_orders.cancelled)
        RETURNING *
    `;
    const values = [txn_id, odoo_saleorder_id, odoo_saleorder_name, qty, unit_price, total_amount, confirmed, billed, cancelled];

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(query, values);
        await client.query('COMMIT');
        return result.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        handleQueryError(error, 'upsertTxnOdooOrder');
    } finally {
        client.release();
    }
}

/**
 * Updates an existing sale order record by Odoo sale order ID.
 * Only updates fields that are provided (non-undefined).
 *
 * @async
 * @param {number} odoo_saleorder_id - The Odoo sale order ID
 * @param {Object} updates - Fields to update
 * @param {boolean} [updates.confirmed] - Whether the order is confirmed
 * @param {boolean} [updates.billed] - Whether the order has been billed
 * @param {boolean} [updates.cancelled] - Whether the order is cancelled
 * @param {number} [updates.total_amount] - Updated total amount
 * @param {string} [updates.odoo_saleorder_name] - Updated sale order name
 * @param {DateTime} [updates.deleted_at] - Deletion timestamp
 * @returns {Promise<db_odoo_txn_order|null>} The updated order record or null if not found
 */
async function updateTxnOdooOrder(odoo_saleorder_id, updates) {
    if (!updates || !isValidInteger(odoo_saleorder_id)) {
        throw new ValidationError(ErrorCodes.VALIDATION.MISSING_PARAMETERS);
    }

    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    const allowedFields = ['confirmed', 'billed', 'cancelled', 'total_amount', 'odoo_saleorder_name', 'deleted_at'];
    for (const field of allowedFields) {
        if (updates[field] !== undefined) {
            if (field === 'deleted_at') {
                if (updates[field] && updates[field].isValid) {
                    values.push(updates[field].toJSDate().toISOString());
                } else {
                    logger.warn(`Invalid DateTime provided for deleted_at field: ${updates[field]}`);
                    values.push(null);
                }
            } else {
                values.push(updates[field]);
            }
            setClauses.push(`${field} = $${paramIndex}`);
            paramIndex++;
        }
    }

    if (setClauses.length === 0) {
        throw new ValidationError(ErrorCodes.VALIDATION.MISSING_PARAMETERS, 'No valid update fields provided');
    }

    const query = `
        UPDATE odoo_txn_orders
        SET ${setClauses.join(', ')}
        WHERE odoo_saleorder_id = ${odoo_saleorder_id}
        RETURNING *
    `;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(query, values);
        await client.query('COMMIT');
        return result.rows[0] || null;
    } catch (error) {
        await client.query('ROLLBACK');
        handleQueryError(error, 'updateTxnOdooOrder');
    } finally {
        client.release();
    }
}

/**
 * Creates or updates an invoice record.
 * If odoo_invoice_id already exists, updates the existing record.
 * To link orders to this invoice, use linkOrderToInvoice() function.
 *
 * @async
 * @param {number} odoo_invoice_id - The Odoo invoice ID (required)
 * @param {Object} invoiceDetails - The invoice details
 * @param {string} [invoiceDetails.odoo_invoice_name] - The Odoo invoice name (e.g., 'INV/2025/0001')
 * @param {number} [invoiceDetails.total_amount] - Total invoice amount
 * @param {boolean} [invoiceDetails.paid] - Whether the invoice is paid
 * @param {boolean} [invoiceDetails.cancelled] - Whether the invoice is cancelled
 * @returns {Promise<db_odoo_invoice>} The upserted invoice record
 */
async function upsertTxnOdooInvoice(odoo_invoice_id, invoiceDetails) {
    if (!odoo_invoice_id || !isValidInteger(odoo_invoice_id)) {
        throw new ValidationError(ErrorCodes.VALIDATION.MISSING_PARAMETERS);
    }
    const {
        odoo_invoice_name,
        total_amount,
        paid,
        cancelled
    } = invoiceDetails;

    const query = `
        INSERT INTO odoo_invoices (odoo_invoice_id, odoo_invoice_name, total_amount, paid, cancelled)
        VALUES ($1, $2, $3, COALESCE($4, false), COALESCE($5, false))
        ON CONFLICT (odoo_invoice_id) DO UPDATE SET odoo_invoice_name = COALESCE(EXCLUDED.odoo_invoice_name,
                                                                                 odoo_invoices.odoo_invoice_name),
                                                    total_amount      = COALESCE(EXCLUDED.total_amount, odoo_invoices.total_amount),
                                                    paid              = COALESCE(EXCLUDED.paid, odoo_invoices.paid),
                                                    cancelled         = COALESCE(EXCLUDED.cancelled, odoo_invoices.cancelled)
        RETURNING *
    `;
    const values = [odoo_invoice_id, odoo_invoice_name, total_amount, paid, cancelled];

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(query, values);
        await client.query('COMMIT');
        return result.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        handleQueryError(error, 'upsertTxnOdooInvoice');
    } finally {
        client.release();
    }
}

/**
 * Updates an existing invoice record by Odoo invoice ID.
 * Only updates fields that are provided (non-undefined).
 *
 * @async
 * @param {number} odoo_invoice_id - The Odoo invoice ID
 * @param {Object} updates - Fields to update
 * @param {boolean} [updates.paid] - Whether the invoice is paid
 * @param {boolean} [updates.cancelled] - Whether the invoice is cancelled
 * @param {number} [updates.total_amount] - Updated total amount
 * @returns {Promise<db_odoo_invoice|null>} The updated invoice record or null if not found
 */
async function updateTxnOdooInvoice(odoo_invoice_id, updates) {
    if (!odoo_invoice_id || !isValidInteger(odoo_invoice_id) || !updates) {
        throw new ValidationError(ErrorCodes.VALIDATION.MISSING_PARAMETERS, {
            invoice_id: odoo_invoice_id,
            updates: updates
        });
    }

    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    const allowedFields = ['paid', 'cancelled', 'total_amount', 'odoo_invoice_name'];
    for (const field of allowedFields) {
        if (updates[field] !== undefined) {
            setClauses.push(`${field} = $${paramIndex}`);
            values.push(updates[field]);
            paramIndex++;
        }
    }

    if (setClauses.length === 0) {
        throw new ValidationError(ErrorCodes.VALIDATION.MISSING_PARAMETERS, 'No valid update fields provided');
    }

    values.push(odoo_invoice_id);
    const query = `
        UPDATE odoo_invoices
        SET ${setClauses.join(', ')}
        WHERE odoo_invoice_id = ${paramIndex}
        RETURNING * `;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(query, values);
        await client.query('COMMIT');
        return result.rows[0] || null;
    } catch (error) {
        await client.query('ROLLBACK');
        handleQueryError(error, 'updateTxnOdooInvoice');
    } finally {
        client.release();
    }
}

/**
 * Gets all order and invoice details for a charging transaction.
 *
 * @async
 * @param {number} txn_id - The charging transaction ID
 * @returns {Promise<Array>} Array of orders with their linked invoices
 */
async function getTxnOdooDetails(txn_id) {
    if (!txn_id) {
        throw new ValidationError(ErrorCodes.VALIDATION.MISSING_PARAMETERS, 'txn_id is required');
    }

    const query = `
        SELECT o.id           as order_id,
               o.txn_id,
               o.odoo_saleorder_id,
               o.odoo_saleorder_name,
               o.qty,
               o.unit_price,
               o.total_amount as order_total,
               o.confirmed,
               o.billed,
               o.cancelled    as order_cancelled,
               o.created_at   as order_created_at,
               i.id           as invoice_id,
               i.odoo_invoice_id,
               i.odoo_invoice_name,
               i.total_amount as invoice_total,
               i.paid,
               i.cancelled    as invoice_cancelled,
               i.created_at   as invoice_created_at
        FROM odoo_txn_orders o
                 LEFT JOIN odoo_order_invoice_link l ON l.order_id = o.id
                 LEFT JOIN odoo_invoices i ON i.id = l.invoice_id
        WHERE o.txn_id = $1
        ORDER BY o.created_at DESC, i.created_at DESC
    `;

    try {
        const result = await pool.query(query, [txn_id]);
        return result.rows;
    } catch (error) {
        handleQueryError(error, 'getTxnOdooDetails');
    }
}

/**
 * Gets the local order record ID by Odoo sale order ID.
 * Useful when you need to link an invoice to an order.
 *
 * @async
 * @param {number} odoo_saleorder_id - The Odoo sale order ID
 * @returns {Promise<number|null>} The local order ID or null if not found
 */
async function getOdooOrderIdBySaleOrderId(odoo_saleorder_id) {
    if (!odoo_saleorder_id) {
        throw new ValidationError(ErrorCodes.VALIDATION.MISSING_PARAMETERS, 'odoo_saleorder_id is required');
    }

    const query = `SELECT id
                   FROM odoo_txn_orders
                   WHERE odoo_saleorder_id = $1`;
    try {
        const result = await pool.query(query, [odoo_saleorder_id]);
        return result.rows[0]?.id || null;
    } catch (error) {
        handleQueryError(error, 'getOdooOrderIdBySaleOrderId');
    }
}

/**
 * Gets the local invoice record ID by Odoo invoice ID.
 *
 * @async
 * @param {number} odoo_invoice_id - The Odoo invoice ID
 * @returns {Promise<number|null>} The local invoice ID or null if not found
 */
async function getInvoiceIdByOdooInvoiceId(odoo_invoice_id) {
    if (!odoo_invoice_id) {
        throw new ValidationError(ErrorCodes.VALIDATION.MISSING_PARAMETERS, 'odoo_invoice_id is required');
    }

    const query = `SELECT id
                   FROM odoo_invoices
                   WHERE odoo_invoice_id = $1`;
    try {
        const result = await pool.query(query, [odoo_invoice_id]);
        return result.rows[0]?.id || null;
    } catch (error) {
        handleQueryError(error, 'getInvoiceIdByOdooInvoiceId');
    }
}

/**
 * Links one or more orders to an invoice (for consolidated billing).
 * Each order can only be linked to one invoice.
 *
 * @async
 * @param {number|number[]} orderIds - Local order ID(s) from odoo_txn_orders.id
 * @param {number} invoiceId - Local invoice ID from odoo_invoices.id
 * @returns {Promise<Array>} Array of created link records
 */
async function linkOrderToInvoice(orderIds, invoiceId) {
    if (!invoiceId) {
        throw new ValidationError(ErrorCodes.VALIDATION.MISSING_PARAMETERS, 'invoiceId is required');
    }

    const orderIdArray = Array.isArray(orderIds) ? orderIds : [orderIds];
    if (orderIdArray.length === 0) {
        throw new ValidationError(ErrorCodes.VALIDATION.MISSING_PARAMETERS, 'At least one orderId is required');
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const results = [];
        for (const orderId of orderIdArray) {
            const query = `
                INSERT INTO odoo_order_invoice_link (order_id, invoice_id)
                VALUES ($1, $2)
                ON CONFLICT (order_id) DO UPDATE SET invoice_id = EXCLUDED.invoice_id
                RETURNING *
            `;
            const result = await client.query(query, [orderId, invoiceId]);
            results.push(result.rows[0]);
        }

        await client.query('COMMIT');
        return results;
    } catch (error) {
        await client.query('ROLLBACK');
        handleQueryError(error, 'linkOrderToInvoice');
    } finally {
        client.release();
    }
}

/**
 * Gets all orders linked to a specific invoice.
 *
 * @async
 * @param {number} invoice_id - The local invoice ID
 * @returns {Promise<Array>} Array of order records
 */
async function getOrdersByInvoiceId(invoice_id) {
    if (!invoice_id) {
        throw new ValidationError(ErrorCodes.VALIDATION.MISSING_PARAMETERS, 'invoice_id is required');
    }

    const query = `
        SELECT o.*
        FROM odoo_txn_orders o
                 INNER JOIN odoo_order_invoice_link l ON l.order_id = o.id
        WHERE l.invoice_id = $1
        ORDER BY o.created_at DESC
    `;

    try {
        const result = await pool.query(query, [invoice_id]);
        return result.rows;
    } catch (error) {
        handleQueryError(error, 'getOrdersByInvoiceId');
    }
}

/**
 * Retrieves the current electricity price from the database.
 * If a `specified_datetime` is provided, it will return the price valid at that time.
 * If no price is found, it returns null.
 *
 * @async
 * @param {DateTime|null} specified_datetime - Optional luxon datetime object to check the price at a specific time.
 * @returns {Promise<{price_eur_kwh: Number, valid_from: DateTime, valid_till: DateTime}|null>}
 */
async function getElectricityPrice(specified_datetime = null) {
    if (specified_datetime && !specified_datetime.isValid) {
        throw new ValidationError(
            ErrorCodes.VALIDATION.INVALID_PARAMETERS,
            `Invalid specified datetime`,
        );
    }

    let query;
    let params = [];

    if (specified_datetime) {
        query = `
            SELECT price_eur_kwh, valid_from, valid_till
            FROM electricity_prices
            WHERE valid_from <= $1::timestamptz
              AND (valid_till IS NULL OR valid_till > $1::timestamptz)
            LIMIT 1
        `;
        params = [specified_datetime];
    } else {
        query = `
            SELECT price_eur_kwh, valid_from, valid_till
            FROM electricity_prices
            WHERE valid_from <= NOW()
              AND (valid_till IS NULL OR valid_till > NOW())
            LIMIT 1
        `;
    }


    const client = await pool.connect();
    try {
        const result = await client.query(query, params);
        if (result.rows.length === 0) {
            return null;
        }
        return {
            for_timestamp: specified_datetime ?? DateTime.now().toUTC(),
            price_eur_kwh: result.rows[0].price_eur_kwh,
            valid_from: result.rows[0].valid_from,
            valid_till: result.rows[0].valid_till,
        };
    } catch (error) {
        handleQueryError(error, 'getElectricityPrice');
    } finally {
        client.release();
    }
}

/**
 * Retrieves the current electricity price or falls back to a default price if none is found.
 *
 * This function attempts to fetch the electricity price for a specified datetime
 * or the current time if no datetime is provided. If no price is found or the price
 * is invalid, it falls back to a default price defined in the global configuration.
 *
 * @async
 * @function getElectricityPriceOrDefault
 * @param {DateTime|null} [specified_datetime=null] - Optional Luxon DateTime object to check the price at a specific time.
 * @returns {Promise<{for_timestamp:DateTime, price_eur_kwh: Number, valid_from: DateTime, valid_till: DateTime}>} - The electricity price in EUR/kWh.
 *
 * @throws {ValidationError} - If the specified datetime is invalid.
 * @throws {DatabaseError} - If there is an error during the database query.
 */
async function getElectricityPriceOrDefault(specified_datetime = null) {
    const priceData = await getElectricityPrice(specified_datetime);

    let for_timestamp, price_eur_kwh, valid_from, valid_till;

    if (priceData) {
        ({for_timestamp, price_eur_kwh, valid_from, valid_till} = priceData);
    }

    if (!isValidNumber(price_eur_kwh)) {
        const default_price = GLOBAL_CONFIG.DEFAULT_ELECTRICITY_PRICE_EUR_PER_KWH_NETTO;
        logger.warn(`No price could be found for ${specified_datetime ?? DateTime.now().toISO()}, falling back to default price ${default_price}`);
        price_eur_kwh = default_price;
        valid_from = null;
        valid_till = null;
    }

    return {for_timestamp, price_eur_kwh, valid_from, valid_till};
}


async function deactivateUser(user) {
    if (!user || !user.user_id) {
        throw new ValidationError(
            ErrorCodes.VALIDATION.MISSING_PARAMETERS,
        );
    }

    const deactivate_user_query = `
        UPDATE users
        SET deactivated_at = now()
        WHERE user_id = $1::integer
    `;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(deactivate_user_query, [user.user_id]);
        if (result.rowCount === 0) {
            throw new Error('Could not deactivate user');
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        handleQueryError(error, 'deactivateUser');
    } finally {
        client.release();
    }
}


async function revokeUserOdooCredentials(user) {
    if (!user || !user.user_id) {
        throw new ValidationError(
            ErrorCodes.VALIDATION.MISSING_PARAMETERS,
            `Missing required parameters.`,
        );
    }

    const query = `
        UPDATE odoo_apikeys
        SET revoked_at = NOW()
        WHERE user_id = $1::integer
          AND revoked_at IS NULL
    `;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(query, [user.user_id]);
        await client.query('COMMIT');
        await recordActivityLog(user.user_id, 'REVOKE ODOO CREDENTIALS', 'DB', user.rfid || 'N/A');
    } catch (error) {
        await client.query('ROLLBACK');
        handleQueryError(error, 'revokeUserOdooCredentials');
    } finally {
        client.release();
    }
}

/**
 * Get total count of users matching the given filters
 * @param {Object} filters - Filter criteria (same format as getUsers)
 * @returns {Promise<number>} Total count of matching users
 */
const getUsersCount = async (filters = {}) => {
    let whereClause = '';
    const whereValues = [];
    let valueIndex = 1;

    if (Object.keys(filters).length > 0) {
        const conditions = [];

        for (const [key, value] of Object.entries(filters)) {
            if (value === null) {
                conditions.push(`${key} IS NULL`);
            } else {
                conditions.push(`${key} = $${valueIndex}`);
                whereValues.push(value);
                valueIndex++;
            }
        }

        whereClause = ' WHERE ' + conditions.join(' AND ');
    }

    const query = `SELECT COUNT(*) as total
                   FROM users${whereClause}`;

    try {
        const client = await pool.connect();
        try {
            const result = await client.query(query, whereValues);
            return parseInt(result.rows[0].total);
        } finally {
            client.release();
        }
    } catch (error) {
        handleQueryError(error, 'getUsersCount');
    }
};

/**
 * Updates specific user's information in the database.
 * Uses a whitelist of allowed columns to prevent unauthorized field updates.
 * @async
 * @param {number} userId - The user the update applies to.
 * @param {Object} updates - Object containing field names and values to update.
 * @param {string} [updates.rfid] - RFID card identifier.
 * @param {string} [updates.first_name] - User's first name.
 * @param {string} [updates.email] - User's email address.
 * @param {number} [updates.odoo_user_id] - Odoo system user ID.
 * @param {string} [updates.last_name] - User's last name.
 * @param {Date} [updates.lastlogin_at] - Last login timestamp.
 * @param {string} [updates.postal_code] - User's postal code.
 * @param {string} [updates.address] - User's address.
 * @param {number} [updates.odoo_partner_id] - Odoo partner ID.
 * @param {string} [updates.name] - User's full name.
 * @param {number} [updates.steve_id] - SteVe system user ID.
 * @param {Date} [updates.deactivated_at] - Deactivation timestamp.
 * @param {Date} [updates.deleted_at] - Deletion timestamp.
 * @returns {Promise<object>} The updated user object.
 * @throws {ValidationError} If userId is invalid, updates is empty, or contains invalid column names.
 * @throws {DatabaseError} If database operation fails.
 */
async function updateUser(userId, updates) {
    const inputsValid = ![userId, updates].some(param => !param || param === '' || (typeof param === 'object' && Object.keys(param).length === 0));
    const userIdIsInteger = Number.isSafeInteger(userId);

    if (!inputsValid || !userIdIsInteger) {
        throw new ValidationError(ErrorCodes.VALIDATION.MISSING_PARAMETERS, 'User ID and updates are required');
    }

    // Whitelist of allowed columns for updates
    const allowedColumns = [
        'rfid',
        'first_name',
        'email',
        'odoo_user_id',
        'last_name',
        'lastlogin_at',
        'postal_code',
        'address',
        'odoo_partner_id',
        'name',
        'steve_id',
        'deactivated_at',
        'deleted_at'
    ];

    const setClause = [];
    const values = [];
    let valueIndex = 1;

    // Build dynamic SET clause based on provided updates
    for (const [key, value] of Object.entries(updates)) {
        if (!allowedColumns.includes(key)) {
            throw new ValidationError(
                ErrorCodes.VALIDATION.INVALID_PARAMETERS,
                `Invalid column name: ${key}`
            );
        }

        if (value !== undefined) {
            // Normalize RFID to uppercase if it's being updated
            const normalizedValue = key === 'rfid' ? normalizeRFID(value) : value;
            setClause.push(`${key} = $${valueIndex}`);
            values.push(normalizedValue);
            valueIndex++;
        }
    }

    if (setClause.length === 0) {
        throw new ValidationError(ErrorCodes.VALIDATION.MISSING_PARAMETERS, 'Updates object contains no valid values');
    }

    // Add updated_at timestamp
    setClause.push(`updated_at = NOW()`);

    // Add user ID as final parameter
    values.push(userId);
    const userIdParam = `$${valueIndex}`;

    const query = `
        UPDATE users
        SET ${setClause.join(', ')}
        WHERE user_id = ${userIdParam}
        RETURNING *
    `;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(query, values);

        if (result.rows.length === 0) {
            throw new ValidationError(ErrorCodes.USER.NOT_FOUND, `User with ID ${userId} not found`);
        }

        await client.query('COMMIT');
        logger.info(`User ${userId} updated successfully`);
        return result.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        handleQueryError(error, 'updateUser');
    } finally {
        client.release();
    }
}

/**
 * Activates a previously deactivated user.
 *
 * @async
 * @param {Object} user - The user object (must include user_id).
 * @throws {ValidationError} If required parameters are missing.
 * @throws {DatabaseError} If activation fails.
 */
async function activateUser(user) {
    if (!user || !user.user_id) {
        throw new ValidationError(
            ErrorCodes.VALIDATION.MISSING_PARAMETERS,
            `Missing required parameters.`,
        );
    }

    const activate_user_query = `
        UPDATE users
        SET deactivated_at = NULL
        WHERE user_id = $1::integer
          AND deactivated_at IS NOT NULL
    `;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(activate_user_query, [user.user_id]);
        if (result.rowCount === 0) {
            throw new Error('Could not activate user - user may already be active or does not exist');
        }
        await client.query('COMMIT');
        await recordActivityLog(user.user_id, 'ACTIVATE USER', 'DB', user.rfid || 'N/A');
    } catch (error) {
        await client.query('ROLLBACK');
        handleQueryError(error, 'activateUser');
    } finally {
        client.release();
    }
}

/**
 * Checks if a user has an open (active) charging session.
 * An open charging session is one where stop_timestamp is NULL.
 *
 * @async
 * @param {number} user_id - The user's ID.
 * @returns {Promise<db_txn|null>} The open charging transaction if exists, null otherwise.
 * @throws {ValidationError} If user_id is invalid.
 * @throws {DatabaseError} If database operation fails.
 */
async function getUserOpenChargingSession(user_id) {
    if (!user_id || !Number.isSafeInteger(user_id)) {
        throw new ValidationError(
            ErrorCodes.VALIDATION.MISSING_PARAMETERS,
            'Valid user_id is required',
        );
    }

    const query = `
        SELECT *
        FROM charging_transactions
        WHERE user_id = $1::integer
          AND stop_timestamp IS NULL
        ORDER BY start_timestamp DESC
        LIMIT 1
    `;

    const client = await pool.connect();
    try {
        const result = await client.query(query, [user_id]);

        if (result.rows.length === 0) {
            return null;
        }

        return result.rows[0];
    } catch (error) {
        handleQueryError(error, 'getUserOpenChargingSession');
    } finally {
        client.release();
    }
}


/**
 * Retrieves unbilled transactions that are stopped and have an associated user.
 * These are transactions that:
 * - Have a stop_timestamp (transaction is complete)
 * - Have a user_id (user is known)
 * - Do NOT have an order created in Odoo yet (not yet billed)
 *
 * @async
 * @param {Object} options - Query options
 * @param {number} [options.limit] - Maximum number of transactions to retrieve
 * @param {number} [options.olderThanHours] - Only get transactions stopped more than X hours ago (default: 0)
 * @returns {Promise<Array<Object<db_txn>>>} Array of unbilled transaction objects
 * @throws {DatabaseError} On query error
 */
async function getUnbilledTransactions(options = {}) {
    const {limit = null, olderThanHours = 0} = options;

    let query = `
        SELECT ct.*
        FROM charging_transactions ct
        WHERE ct.start_timestamp IS NOT NULL
          AND ct.stop_timestamp IS NOT NULL
          -- For backward compatibility, check both invoice_ref and odoo_txn_orders --
          AND ct.invoice_ref IS NULL
          AND NOT EXISTS (SELECT 1
                          FROM odoo_txn_orders o
                          WHERE o.txn_id = ct.id)
    `;

    const values = [];
    let paramIndex = 1;

    // Add time filter if specified
    if (olderThanHours > 0) {
        query += ` AND ct.stop_timestamp < NOW() - INTERVAL '${olderThanHours} hours'`;
    }

    // Newest transactions first
    query += ` ORDER BY ct.id DESC`;

    // Add limit if specified
    if (limit && Number.isSafeInteger(limit) && limit > 0) {
        query += ` LIMIT $${paramIndex}`;
        values.push(limit);
        paramIndex++;
    }

    const client = await pool.connect();
    try {
        const result = await client.query(query, values);
        return result.rows;
    } catch (error) {
        handleQueryError(error, 'getUnbilledTransactions');
    } finally {
        client.release();
    }
}

/**
 * Attempts to associate a user with a transaction by looking up the user via RFID.
 * This is useful for retroactively associating users who registered after their transaction started.
 *
 * @async
 * @param {Object<db_txn>} db_txn - The database transaction object
 * @returns {Promise<number|null>} The user_id if found and updated, null otherwise
 * @throws {DatabaseError|ValidationError} On query error
 */
async function tryAssociateUserToTransaction(db_txn) {
    // If transaction already has a user, nothing to do
    if (db_txn.user_id) {
        logger.debug(`Transaction ${db_txn.id} already has user_id ${db_txn.user_id}`);
        return db_txn.user_id;
    }

    // If no RFID tag, cannot lookup user
    if (!db_txn.ocpp_id_tag) {
        logger.warn(`Transaction ${db_txn.id} has no RFID tag, cannot associate user`);
        return null;
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Look up user by RFID (case-insensitive)
        const userLookupQuery = `
            SELECT user_id, steve_id
            FROM users
            WHERE LOWER(rfid) = LOWER($1)
            LIMIT 1
        `;

        const userLookupResult = await client.query(userLookupQuery, [db_txn.ocpp_id_tag]);

        if (userLookupResult.rowCount === 0) {
            logger.info(`No user found with RFID '${db_txn.ocpp_id_tag}' for transaction ${db_txn.id}`);
            await client.query('COMMIT');
            return null;
        }

        const user = userLookupResult.rows[0];

        // Update transaction with user_id
        const updateQuery = `
            UPDATE charging_transactions
            SET user_id = $1
            WHERE id = $2
            RETURNING *
        `;

        await client.query(updateQuery, [user.user_id, db_txn.id]);

        await client.query('COMMIT');
        logger.info(`Successfully associated user ${user.user_id} with transaction ${db_txn.id}`);

        return user.user_id;
    } catch (error) {
        await client.query('ROLLBACK');
        handleQueryError(error, 'tryAssociateUserToTransaction');
    } finally {
        client.release();
    }
}


async function getVAT(datetime = null) {
    if (datetime && !datetime.isValid) {
        throw new ValidationError(
            ErrorCodes.VALIDATION.INVALID_PARAMETERS, 'datetime must be valid DateTime object');
    }

    // Normalize lookup timestamp to UTC to avoid local timezone ambiguity.
    datetime = datetime ? datetime.toUTC().toJSDate() : DateTime.utc().toJSDate();

    try {
        const query_format = `
            SELECT *
            FROM vat_rates
            WHERE effective_from < $1::timestamptz
              AND (effective_to IS NULL OR effective_to > $1::timestamptz)
            ORDER BY effective_from DESC, id DESC
            LIMIT 1
        `;

        const params = [datetime];

        const results = await pool.query(query_format, params);
        return results.rows[0];
    } catch (error) {
        handleQueryError(error, 'getVAT');
    }
}


/**
 * Retrieves all electricity prices ordered by valid_from descending.
 *
 * @async
 * @returns {Promise<Array>} Array of electricity price records
 */
async function getAllElectricityPrices() {
    const query = `
        SELECT id, price_eur_kwh, valid_from, valid_till, created_at
        FROM electricity_prices
        ORDER BY valid_from DESC
    `;
    try {
        const result = await pool.query(query);
        return result.rows;
    } catch (error) {
        handleQueryError(error, 'getAllElectricityPrices');
    }
}


/**
 * Inserts a new electricity price starting at `valid_from`.
 * Automatically closes the currently active price period to prevent gaps.
 * Rejects if `valid_from` is at or before the latest existing price start date
 * to preserve the audit trail.
 *
 * If a price is active at `valid_from`, its `valid_till` is set to `valid_from`
 * so there is no gap or overlap.
 *
 * @async
 * @param {number} price_eur_kwh - The price in EUR/kWh (netto)
 * @param {DateTime} valid_from - Luxon DateTime when the new price takes effect
 * @returns {Promise<Object>} The inserted price record
 */
async function setElectricityPrice(price_eur_kwh, valid_from) {
    if (!isValidNumber(price_eur_kwh) || price_eur_kwh < 0) {
        throw new ValidationError(
            ErrorCodes.VALIDATION.INVALID_PARAMETERS,
            'price_eur_kwh must be a non-negative number',
        );
    }
    if (!valid_from || !valid_from.isValid) {
        throw new ValidationError(
            ErrorCodes.VALIDATION.INVALID_PARAMETERS,
            'valid_from must be a valid DateTime',
        );
    }

    const validFromJS = valid_from.toUTC().toJSDate();

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Reject if valid_from is at or before the latest existing record's start
        // Also reject if the new price is the same as the latest active price
        const latestResult = await client.query(`
            SELECT price_eur_kwh, valid_from
            FROM electricity_prices
            ORDER BY valid_from DESC
            LIMIT 1
        `);
        if (latestResult.rows.length > 0) {
            const latestFrom = new Date(latestResult.rows[0].valid_from);
            if (validFromJS <= latestFrom) {
                throw new ValidationError(
                    ErrorCodes.VALIDATION.INVALID_PARAMETERS,
                    `valid_from must be after the latest price start date (${latestFrom.toISOString()})`,
                );
            }
            if (latestResult.rows[0].price_eur_kwh === price_eur_kwh) {
                throw new ValidationError(
                    ErrorCodes.VALIDATION.INVALID_PARAMETERS,
                    `New price (${price_eur_kwh} EUR/kWh) is identical to the current active price`,
                );
            }
        }

        // Close any price period that covers the new valid_from
        await client.query(`
            UPDATE electricity_prices
            SET valid_till = $1::timestamptz
            WHERE valid_from < $1::timestamptz
              AND (valid_till IS NULL OR valid_till > $1::timestamptz)
        `, [validFromJS]);

        // Insert the new price (open-ended)
        const result = await client.query(`
            INSERT INTO electricity_prices (price_eur_kwh, valid_from, valid_till)
            VALUES ($1, $2::timestamptz, NULL)
            RETURNING *
        `, [price_eur_kwh, validFromJS]);

        await client.query('COMMIT');
        return result.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        handleQueryError(error, 'setElectricityPrice');
    } finally {
        client.release();
    }
}


/**
 * Retrieves all VAT rates ordered by effective_from descending.
 *
 * @async
 * @returns {Promise<Array>} Array of VAT rate records
 */
async function getAllVATRates() {
    const query = `
        SELECT id, rate, description, effective_from, effective_to, created_at, updated_at
        FROM vat_rates
        ORDER BY effective_from DESC
    `;
    try {
        const result = await pool.query(query);
        return result.rows;
    } catch (error) {
        handleQueryError(error, 'getAllVATRates');
    }
}


/**
 * Inserts a new VAT rate starting at `effective_from`.
 * Automatically closes the currently active VAT period to prevent gaps.
 * Rejects if `effective_from` is at or before the latest existing rate start date
 * to preserve the audit trail.
 *
 * If a rate is active at `effective_from`, its `effective_to` is set to `effective_from`
 * so there is no gap or overlap.
 *
 * @async
 * @param {number} rate - The VAT rate as integer percentage (e.g. 19 for 19%)
 * @param {string} description - Description of the rate
 * @param {DateTime} effective_from - Luxon DateTime when the new rate takes effect
 * @returns {Promise<Object>} The inserted VAT rate record
 */
async function setVATRate(rate, description, effective_from) {
    if (!Number.isSafeInteger(rate) || rate < 0 || rate > 100) {
        throw new ValidationError(
            ErrorCodes.VALIDATION.INVALID_PARAMETERS,
            'rate must be an integer between 0 and 100',
        );
    }
    if (!effective_from || !effective_from.isValid) {
        throw new ValidationError(
            ErrorCodes.VALIDATION.INVALID_PARAMETERS,
            'effective_from must be a valid DateTime',
        );
    }

    const effectiveFromJS = effective_from.toUTC().toJSDate();

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Reject if effective_from is at or before the latest existing record's start
        // Also reject if the new rate is the same as the latest active rate
        const latestResult = await client.query(`
            SELECT rate, effective_from
            FROM vat_rates
            ORDER BY effective_from DESC
            LIMIT 1
        `);
        if (latestResult.rows.length > 0) {
            const latestFrom = new Date(latestResult.rows[0].effective_from);
            if (effectiveFromJS <= latestFrom) {
                throw new ValidationError(
                    ErrorCodes.VALIDATION.INVALID_PARAMETERS,
                    `effective_from must be after the latest VAT rate start date (${latestFrom.toISOString()})`,
                );
            }
            if (latestResult.rows[0].rate === rate) {
                throw new ValidationError(
                    ErrorCodes.VALIDATION.INVALID_PARAMETERS,
                    `New VAT rate (${rate}%) is identical to the current active rate`,
                );
            }
        }

        // Close any VAT rate period that covers the new effective_from
        await client.query(`
            UPDATE vat_rates
            SET effective_to = $1::timestamptz,
                updated_at   = NOW()
            WHERE effective_from < $1::timestamptz
              AND (effective_to IS NULL OR effective_to > $1::timestamptz)
        `, [effectiveFromJS]);

        // Insert the new rate (open-ended)
        const result = await client.query(`
            INSERT INTO vat_rates (rate, description, effective_from, effective_to)
            VALUES ($1, $2, $3::timestamptz, NULL)
            RETURNING *
        `, [rate, description || null, effectiveFromJS]);

        await client.query('COMMIT');
        return result.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        handleQueryError(error, 'setVATRate');
    } finally {
        client.release();
    }
}


module.exports = {
    db: {
        handleQueryError,
        createUser,
        getUsers,
        getUserUnique,
        setUserOdooCredentials,
        getUserOdooCredentials,
        rotateOdooUserKey,
        setSteveUserParamaters,
        recordActivityLog,
        recordTransaction: recordSteveTxn,
        saveInvoiceId,
        getElectricityPrice,
        getElectricityPriceOrDefault,
        deactivateUser,
        revokeUserOdooCredentials,
        getUsersCount,
        updateUser,
        activateUser,
        getUnbilledTransactions,
        tryAssociateUserToTransaction,
        getUserOpenChargingSession,
        // Odoo transaction details
        upsertTxnOdooOrder,
        updateTxnOdooOrder,
        upsertTxnOdooInvoice,
        updateTxnOdooInvoice,
        getTxnOdooDetails,
        getOdooOrderIdBySaleOrderId,
        getInvoiceIdByOdooInvoiceId,
        linkOrderToInvoice,
        getOrdersByInvoiceId,
        getTransactionBySteveTxnId,
        getVAT,
        // Pricing admin
        getAllElectricityPrices,
        setElectricityPrice,
        getAllVATRates,
        setVATRate,
    },
    normalizeRFID,
};