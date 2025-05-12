const logger = require('../services/logger');
const pool = require('../services/db_conn');
const {DatabaseError, ErrorCodes, ValidationError} = require('./errors');


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
    if (!oauth_id || !name || !email || !rfid) {
        throw new ValidationError(ErrorCodes.VALIDATION.MISSING_PARAMETERS, 'Missing required parameters: oauth_id, name, email or rfid.');
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
        recordActivityLog(created_user.user_id, 'Create', 'DB', rfid);
        await client.query('COMMIT');
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
    if (options.orderBy) {
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
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(query, values);
        await client.query('COMMIT');
        return result.rows;
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
 * @param {Object} filters - Object containing field names and values to filter by
 * @returns {Promise<Object|null>} - The matching user or null if not found
 * @throws {DatabaseError} - If multiple users match or database operation fails
 */
const getUserUnique = async (filters) => {
    try {
        const users = await getUsers(filters, {limit: 2});

        if (users.length > 1) {
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
    } catch (error) {
        handleQueryError(error, 'getUserUnique');
    }
};


const setUserOdooCredentials = async (user, credentials) => {
    const {odoo_user_id, partner_id, encrypted_key, salt} = credentials;

    if (!user || !odoo_user_id || !partner_id || !encrypted_key || !salt) {
        throw new ValidationError(
            ErrorCodes.VALIDATION.MISSING_PARAMETERS,
            `Missing required parameters.`,
        );
    }

    if (!Number.isInteger(user.user_id) || !Number.isInteger(odoo_user_id) || !Number.isInteger(partner_id)) {
        throw new ValidationError(
            ErrorCodes.VALIDATION.INVALID_PARAMETERS,
            `Invalid parameters.`,
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
    `;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(userTableQuery, [odoo_user_id, partner_id, user.user_id]);
        await client.query(odooUserKeyQuery, [user.user_id, encrypted_key, salt]);
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        handleQueryError(error, 'setUserOdooCredentials');
    } finally {
        client.release();
    }
};


const getUserOdooCredentials = async (user_id) => {
    if (!user_id) {
        throw new ValidationError(
            ErrorCodes.VALIDATION.MISSING_PARAMETERS,
            `Missing required parameters.`,
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


const rotateOdooUserKey = async (user_id, old_key_id, new_key, new_key_salt) => {
    if (!user_id || !old_key_id || !new_key || !new_key_salt) {
        throw new ValidationError(
            ErrorCodes.VALIDATION.MISSING_PARAMETERS,
            `Missing required parameters.`,
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
        VALUES ($1::integer, $2, $3)
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


const setSteveUserParamaters = async (user, steve_id) => {
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


const recordActivityLog = (user_id, event_type, target, rfid) => {
    try {
        const activity_log_query = `
            INSERT INTO activity_log (user_id, event_type, target, rfid)
            VALUES ($1, $2, $3::varchar, $4)
        `;
        pool.query(activity_log_query, [user_id, event_type, target, rfid]);
    } catch (error) {
        handleQueryError(error, 'recordActivityLog');
    }
};

/**
 * Upsert a transaction record into the `charging_transactions` table.
 * Inserts a new row or updates stopTimestamp, stopValue, and stopReason on conflict.
 * @param {Object} tx
 */
async function upsertTransaction(tx) {
    // FIXME: I am skeptical about this logic. Since we already fetch stopped transactions no need to update they are already final.
    // Switch to skipping steve_id, ocpp_id_tag, delivered, start_timestamp and stop_timestamp same values.
    const query = `
        INSERT INTO charging_transactions (steve_id, ocpp_id_tag, start_timestamp, stop_timestamp, start_value,
                                           stop_value,
                                           stop_reason)
        VALUES ($1::integer, $2, $3, $4, $5::numeric, $6::numeric, $7::varchar)
        ON CONFLICT (steve_id) DO UPDATE SET stop_timestamp = EXCLUDED.stop_timestamp,
                                             stop_value     = EXCLUDED.stop_value,
                                             stop_reason    = EXCLUDED.stop_reason;
    `;
    const values = [
        tx.id,
        tx.ocppIdTag,
        tx.startTimestamp,
        tx.stopTimestamp,
        tx.startValue,
        tx.stopValue,
        tx.stopReason,
    ];

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(query, values);
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        handleQueryError(error, 'upsertTransaction');
    } finally {
        client.release();
    }
}

async function setLastStopTimestamp(new_watermark) {
    const query = `
        INSERT INTO watermark (last_stop_timestamp)
        VALUES ($1::timestamp)
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

async function getLastStopTimestamp() {
    const query = `
        SELECT last_stop_timestamp
        FROM watermark
        ORDER BY created_at DESC
        LIMIT 1
    `;

    const client = await pool.connect();
    try {
        const result = await client.query(query);
        return result.rows[0]?.last_stop_timestamp || null;
    } catch (error) {
        handleQueryError(error, 'getLastStopTimestamp');
    } finally {
        client.release();
    }
}

module.exports = {
    db: {
        createUser,
        getUsers,
        getUserUnique,
        setUserOdooCredentials,
        getUserOdooCredentials,
        rotateOdooUserKey,
        setSteveUserParamaters,
        recordActivityLog,
        upsertTransaction,
        setLastStopTimestamp,
        getLastStopTimestamp,
    },
};