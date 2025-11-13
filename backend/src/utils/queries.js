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
    //TODO: Only req.oidc can be porided

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
 * Sets the last stop timestamp watermark.
 * Inserts or updates the `watermark` table with the given timestamp.
 *
 * @async
 * @param {DateTime} new_watermark - The new last stop timestamp (watermark).
 * @returns {Promise<void>}
 */
async function setLastStopTimestamp(new_watermark) {
    if (!new_watermark || !new_watermark.isValid) {
        throw new ValidationError(
            ErrorCodes.VALIDATION.MISSING_PARAMETERS,
            `Invalid or missing new watermark timestamp.`,
        );
    }


    const query = `
        INSERT INTO watermark (last_stop_timestamp)
        VALUES ($1::timestamptz)
        ON CONFLICT (last_stop_timestamp)
            DO UPDATE SET iterated_at = NOW()
    `;
    const value = [new_watermark];

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(query, value);
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        handleQueryError(error, 'setLastStopTimestamp');
    } finally {
        client.release();
    }
}


/**
 * Retrieves the most recent `last_stop_timestamp` aka watermark from the watermark table.
 * Returns a Luxon DateTime if found, otherwise null.
 *
 * @async
 * @returns {Promise<DateTime|null>} The latest stop timestamp or null if not found or error on watermark fetch.
 */
async function getLastStopTimestamp() {
    const query = `SELECT last_stop_timestamp::timestamptz, iterated_at::timestamptz
                   FROM watermark
                   ORDER BY created_at DESC
                   LIMIT 1;`;

    let last_stop_timestamp = null;

    const client = await pool.connect();
    try {
        const result = await client.query(query);
        const row = result.rows[0];

        if (row) {
            const lastStopTs = row.last_stop_timestamp ? DateTime.fromJSDate(row.last_stop_timestamp) : null;
            const iteratedAt = row.iterated_at ? DateTime.fromJSDate(row.iterated_at) : null;

            // If iterated_at exists and is greater than last_stop_timestamp, use iterated_at
            if (iteratedAt && lastStopTs && iteratedAt > lastStopTs) {
                last_stop_timestamp = iteratedAt;
            } else {
                last_stop_timestamp = lastStopTs;
            }
        }
    } catch (error) {
        // Silently log the error as we dont want to break functionality if watermark is missing
        handleQueryError(error, 'getLastStopTimestamp', true);
    } finally {
        client.release();
    }
    logger.verbose('Fetched last stop timestamp watermark:', {last_stop_timestamp: last_stop_timestamp ? last_stop_timestamp.toISO() : 'N/A'});
    return last_stop_timestamp;
}


/**
 * Updates the `invoice_ref` field for a transaction in `charging_transactions`.
 * This is used to link a transaction to an invoice in Odoo.
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
 * Retrieves the current electricity price from the database.
 * If a `specified_datetime` is provided, it will return the price valid at that time.
 * If no price is found, it returns null.
 *
 * @async
 * @param {DateTime|null} specified_datetime - Optional luxon datetime object to check the price at a specific time.
 * @returns {Promise<number>|null} If `specified_datetime` provided, that datetime's if not, the current electricity price in cents per kWh.
 */
async function getCurrentElectricityPrice(specified_datetime = null) {
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
            SELECT price
            FROM electricity_prices
            WHERE valid_from <= $1::timestamptz
              AND (valid_till IS NULL OR valid_till > $1::timestamptz)
            LIMIT 1
        `;
        params = [specified_datetime];
    } else {
        query = `
            SELECT price
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
        return result.rows[0].price;
    } catch (error) {
        handleQueryError(error, 'getCurrentElectricityPrice');
    } finally {
        client.release();
    }
}


async function deactivateUser(user) {
    if (!user || !user.user_id) {
        throw new ValidationError(
            ErrorCodes.VALIDATION.MISSING_PARAMETERS,
            `Missing required parameters.`,
        );
    }

    const deactivate_user_query = `
        UPDATE users
        SET deactivated_at = now()
        WHERE user_id = $1::integer
          AND deactivated_at IS NULL
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
        const result = await client.query(query, [user.user_id]);
        if (result.rowCount === 0) {
            logger.warn('No Odoo credentials found to revoke for user', {user_id: user.user_id});
        }
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
 * Deletes a user from the database (hard delete).
 * WARNING: This permanently removes the user and all associated records.
 *
 * @async
 * @param {Object} user - The user object (must include user_id).
 * @throws {ValidationError} If required parameters are missing.
 * @throws {DatabaseError} If deletion fails.
 */
async function deleteUser(user) {
    if (!user || !user.user_id) {
        throw new ValidationError(
            ErrorCodes.VALIDATION.MISSING_PARAMETERS,
            `Missing required parameters.`,
        );
    }

    const delete_user_query = `
        DELETE
        FROM users
        WHERE user_id = $1::integer
    `;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Log before deletion
        await recordActivityLog(user.user_id, 'DELETE USER', 'DB', user.rfid || 'N/A');

        const result = await client.query(delete_user_query, [user.user_id]);
        if (result.rowCount === 0) {
            throw new Error('Could not delete user - user does not exist');
        }
        await client.query('COMMIT');
        logger.info(`User ${user.user_id} deleted from database`);
    } catch (error) {
        await client.query('ROLLBACK');
        handleQueryError(error, 'deleteUser');
    } finally {
        client.release();
    }
}

/**
 * Retrieves unbilled transactions that are stopped and have an associated user.
 * These are transactions that:
 * - Have a stop_timestamp (transaction is complete)
 * - Have a user_id (user is known)
 * - Do NOT have an invoice_ref (not yet billed)
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
        SELECT *
        FROM charging_transactions
        WHERE stop_timestamp IS NOT NULL
          AND invoice_ref IS NULL
    `;

    const values = [];
    let paramIndex = 1;

    // Add time filter if specified
    if (olderThanHours > 0) {
        query += ` AND stop_timestamp < NOW() - INTERVAL '${olderThanHours} hours'`;
    }

    // Newest transactions first
    query += ` ORDER BY id DESC`;

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
        setLastStopTimestamp,
        getLastStopTimestamp,
        saveInvoiceId,
        getCurrentElectricityPrice,
        deactivateUser,
        revokeUserOdooCredentials,
        getUsersCount,
        updateUser,
        activateUser,
        deleteUser,
        getUnbilledTransactions,
        tryAssociateUserToTransaction,
    },
    normalizeRFID,
};