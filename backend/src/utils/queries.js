'use strict';
/**
 * @file Global database queries
 *
 * @module utils/queries
 */


const logger = require('../services/logger');
const pool = require('../services/db_conn');
const {DatabaseError, ErrorCodes, ValidationError} = require('./errors');
const {DateTime} = require('luxon');
const {steveTransactionSchema} = require('./joi');


/**
 * Handles query errors.
 *
 * @param {Error} error - The error object.
 * @param {string} operation - The operation being performed.
 * @throws {Error} - The error that happened during the operation.
 */
const handleQueryError = (error, operation) => {
    logger.error(`Error during ${operation} operation:`, error);
    throw new DatabaseError(
        ErrorCodes.DATABASE.QUERY_ERROR,
        `Error during ${operation} operation.`,
        error,
    );
};


const createUser = async (oauth_id, name, email, rfid) => {
    //TODO: Only req.oidc can be porided


    if (!oauth_id || !name || !email || !rfid) {
        throw new ValidationError(ErrorCodes.VALIDATION.MISSING_PARAMETERS);
    }

    const query = `
        INSERT INTO users (oauth_id, name, email, rfid)
        VALUES ($1, $2, $3::varchar, $4)
        RETURNING *
    `;
    const values = [oauth_id, name, email, rfid];

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(query, values);
        const created_user = result.rows[0];
        await client.query('COMMIT');

        // Since recordActivityLog is now async, await it
        await recordActivityLog(created_user.user_id, 'CREATE USER', 'DB', rfid);
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
 * @example
 * getUsers({ first_name: 'John' }) - Get all users named John
 * getUsers({ active: true }, { limit: 10, offset: 20 }) - Get 10 active users, skipping first 20
 * getUsers({}, { orderBy: 'created_at', orderDirection: 'DESC' }) - Get all users ordered by creation date descending
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
 * @returns {Promise<Object<User>|null>} - The matching user or null if not found
 * @throws {DatabaseError} - database operation fails
 * @throws {ValidationError} - if multiple users match the criteria
 */
const getUserUnique = async (filters) => {
    if (!filters || typeof filters !== 'object' || Object.keys(filters).length === 0) {
        throw new ValidationError(
            ErrorCodes.VALIDATION.MISSING_PARAMETERS,
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

    if (!user || !odoo_user_id || !odoo_partner_id || !encrypted_key || !salt) {
        throw new ValidationError(
            ErrorCodes.VALIDATION.MISSING_PARAMETERS,
        );
    }

    if (!Number.isInteger(user.user_id) || !Number.isInteger(odoo_user_id) || !Number.isInteger(odoo_partner_id)) {
        throw new ValidationError(
            ErrorCodes.VALIDATION.INVALID_PARAMETERS,
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
    if (!user_id) {
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

    try {
        const result = await pool.query(query, [user_id]);

        if (result.rows.length === 0) {
            return null; // No valid credentials found
        }

        return result.rows[0];
    } catch (error) {
        handleQueryError(error, 'getUserOdooCredentials');
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
    if (!user_id || !old_key_id || !new_key || !new_key_salt) {
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
 * @param {string|null} reason
 * @returns {Promise<void>}
 */
async function recordActivityLog(user_id, event_type, target, rfid, reason = null) {
    // If user_id is null or undefined, don't attempt to insert a record
    // This prevents foreign key constraint violations
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
        logger.error(`Error recording activity log: ${error.message}`, error)
    } finally {
        client.release();
    }
}


/**
 * Record a transaction record into the `charging_transactions` table.
 * If transaction already exists and is complete, returns it without modification.
 * Otherwise, inserts a new record with proper user association or updates existing one.
 *
 * @async
 * @param {Object} tx - Transaction from Steve system
 * @returns {Promise<Object>} db_txn - The transaction record from database
 */
async function recordTransaction(tx) {
    const {transactionError} = steveTransactionSchema.validate(tx);
    if (transactionError) {
        throw new ValidationError(
            ErrorCodes.VALIDATION.INVALID_PARAMETERS,
            `Invalid transaction data: ${transactionError.message}`,
        );
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // First check if transaction already exists in our database
        const existingTxQuery = `
            SELECT *
            FROM charging_transactions
            WHERE tx_steve_id = $1
        `;

        const existingTxResult = await client.query(existingTxQuery, [tx.id]);

        // If transaction exists, check if values match to avoid unnecessary updates
        if (existingTxResult.rowCount > 0) {
            const existingTx = existingTxResult.rows[0];

            // Check if transaction is complete and matches incoming data
            if (existingTx.stop_timestamp !== null &&
                DateTime.fromJSDate(existingTx.stop_timestamp).toUTC().toMillis() === DateTime.fromISO(tx.stopTimestamp).toMillis()
            ) {
                logger.info('Transaction already exists with matching stop timestamp - returning existing record');
                await client.query('COMMIT');
                return existingTx;
            }

            // Transaction exists but needs updating
            logger.info(`Updating existing transaction ${existingTx.id} (Steve ID: ${tx.id})`);
            const updateQuery = `
                UPDATE charging_transactions
                SET ocpp_id_tag     = $1,
                    start_timestamp = $2,
                    stop_timestamp  = $3,
                    start_value     = $4::numeric,
                    stop_value      = $5::numeric,
                    stop_reason     = $6::varchar
                WHERE tx_steve_id = $7::integer
                RETURNING *
            `;

            const updateValues = [
                tx.ocppIdTag,
                tx.startTimestamp,
                tx.stopTimestamp,
                tx.startValue,
                tx.stopValue,
                tx.stopReason,
                tx.id,
            ];

            const updateResult = await client.query(updateQuery, updateValues);
            await client.query('COMMIT');
            return updateResult.rows[0];
        }

        // Transaction doesn't exist, proceed with user lookup
        const userCrossCheckQuery = `
            SELECT user_id
            FROM users
            WHERE steve_id = $1::integer
              AND rfid = $2::varchar
        `;

        const userCrossCheckResult = await client.query(userCrossCheckQuery, [tx.ocppTagPk, tx.ocppIdTag]);
        let user_id = null;

        if (userCrossCheckResult.rowCount > 0) {
            user_id = userCrossCheckResult.rows[0].user_id;
        } else {
            logger.warn(`Unknown user's transaction is received. Inserting without user_id. ocppTagPk=${tx.ocppTagPk}, ocppIdTag=${tx.ocppIdTag}`);
        }

        const insertQuery = `INSERT INTO charging_transactions
                             (tx_steve_id, ocpp_id_tag, start_timestamp, stop_timestamp, start_value, stop_value,
                              stop_reason, user_id)
                             VALUES ($1::integer, $2, $3, $4, $5::numeric, $6::numeric, $7::varchar, $8)
                             RETURNING *`;

        const values = [
            tx.id,
            tx.ocppIdTag,
            tx.startTimestamp,
            tx.stopTimestamp,
            tx.startValue,
            tx.stopValue,
            tx.stopReason,
            user_id,
        ];

        const result = await client.query(insertQuery, values);
        await client.query('COMMIT');
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
 * @param {string|Date} new_watermark - The new last stop timestamp.
 * @returns {Promise<void>}
 */
async function setLastStopTimestamp(new_watermark) {
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
 * Retrieves the most recent `last_stop_timestamp` from the watermark table.
 * Returns a Luxon DateTime if found, otherwise null.
 *
 * @async
 * @returns {Promise<DateTime|null>} The latest stop timestamp or null if not found.
 * @throws {DatabaseError} On query error.
 */
async function getLastStopTimestamp() {
    const query = `
        SELECT last_stop_timestamp::timestamptz
        FROM watermark
        ORDER BY created_at DESC
        LIMIT 1
    `;

    const client = await pool.connect();
    try {
        const result = await client.query(query);
        return result.rows[0]?.last_stop_timestamp
            ? DateTime.fromJSDate(result.rows[0].last_stop_timestamp)
            : null;
    } catch (error) {
        handleQueryError(error, 'getLastStopTimestamp');
    } finally {
        client.release();
    }
}


/**
 * Updates the `invoice_ref` field for a transaction in `charging_transactions`.
 * This is used to link a transaction to an invoice in Odoo.
 *
 * @async
 * @param {Object} txn - The transaction object (must include `id`).
 * @param {number} invoice_id - The invoice ID came from Odoo to set.
 * @returns {Promise<void>}
 * @throws {DatabaseError|ValidationError} On query error.
 */
async function saveInvoiceId(txn, invoice_id) {
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
 * @param {DateTime|null} specified_datetime - Optional ISO 8601 datetime string to check the price at a specific time.
 * @returns {Promise<number>|null} The current electricity price in cents per kWh.
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

// This function is a placeholder for updating user information.
//TODO: DO we need to store additional user information in the database?
async function updateUser(userId, updates) {
    if (!userId || !updates || Object.keys(updates).length === 0) {
        throw new ValidationError(ErrorCodes.VALIDATION.MISSING_PARAMETERS, 'User ID and updates are required');
    }

    const setClause = [];
    const values = [];
    let valueIndex = 1;

    // Build dynamic SET clause based on provided updates
    for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
            setClause.push(`${key} = $${valueIndex}`);
            values.push(value);
            valueIndex++;
        }
    }

    if (setClause.length === 0) {
        throw new ValidationError(ErrorCodes.VALIDATION.MISSING_PARAMETERS, 'User ID and updates are required');
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

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await client.query(query, values);

            if (result.rows.length === 0) {
                throw new ValidationError('User not found', ErrorCodes.USER_NOT_FOUND);
            }

            await client.query('COMMIT');
            logger.info(`User ${userId} updated successfully`);
            return result.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        handleQueryError(error, 'updateUser');
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
        recordTransaction,
        setLastStopTimestamp,
        getLastStopTimestamp,
        saveInvoiceId,
        getCurrentElectricityPrice,
        deactivateUser,
        revokeUserOdooCredentials,
        getUsersCount,
        updateUser,
    },
};