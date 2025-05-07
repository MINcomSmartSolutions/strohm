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


const createDBUser = async (oauth_id, name, email, rfid) => {
    if (!oauth_id || !name || !email || !rfid) {
        throw new ValidationError(ErrorCodes.VALIDATION.MISSING_PARAMETERS, 'Missing required parameters: oauth_id, name, email or rfid.');
    }

    const query = `
        INSERT INTO users (oauth_id, name, email, rfid)
        VALUES ($1, $2, $3::varchar, $4)
        RETURNING *
    `;
    const values = [oauth_id, name, email, rfid];

    try {
        const result = await pool.query(query, values);
        const created_user = result.rows[0];
        recordActivityLog(created_user.user_id, 'Create', rfid, 'DB');
        return created_user;
    } catch (error) {
        handleQueryError(error, 'createDBUser');
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
    try {
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

        const result = await pool.query(query, values);
        return result.rows;
    } catch (error) {
        handleQueryError(error, 'getUsers');
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

    try {
        await pool.query(userTableQuery, [odoo_user_id, partner_id, user.user_id]);
        await pool.query(odooUserKeyQuery, [user.user_id, encrypted_key, salt]);
    } catch (error) {
        handleQueryError(error, 'setUserOdooCredentials');
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
        SET revoked_at = NOW()
        WHERE user_id = $1::integer
          AND id = $2::integer
          AND revoked_at IS NULL
    `;

    const insertQuery = `
        INSERT INTO odoo_apikeys (user_id, key, salt)
        VALUES ($1::integer, $2, $3)
    `;


    try {
        const result = await pool.query(query, [user_id, old_key_id]);
        if (result.rowCount === 0) {
            throw new ValidationError(
                ErrorCodes.USER.ODOO_NO_CREDENTIALS,
                `${user_id}'s old key is already revoked or does not exist. Cannot rotate key. Request a new one.`,
            );
        }

        const insertResult = await pool.query(insertQuery, [user_id, new_key, new_key_salt]);
        if (insertResult.rowCount === 0) {
            throw new ValidationError(
                ErrorCodes.USER.ODOO_NO_CREDENTIALS,
                `Failed to insert new key for user ID ${user_id}.`,
            );
        }

        return true; // Rotation successful
    } catch (error) {
        handleQueryError(error, 'rotateOdooUserCredentials');
    }
};


const setSteveUserParamaters = async (user, steve_id) => {

    const update_query = `
        UPDATE users
        SET steve_id = $1::integer
        WHERE user_id = $2::integer
    `;

    try {
        const result = await pool.query(update_query, [steve_id, user.user_id]);
        if (result.rowCount === 0) {
            throw new Error('Could not set user parameters');
        }
        return result.rows[0];
    } catch (error) {
        handleQueryError(error, 'setSteveUserParamaters');
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


module.exports = {
    createDBUser,
    getUsers,
    getUserUnique,
    setUserOdooCredentials,
    getUserOdooCredentials,
    rotateOdooUserKey,
    setSteveUserParamaters,
    recordActivityLog,
};