const logger = require('./logger');
const pool = require('./db_conn');
const {DatabaseError, ErrorCodes, ValidationError} = require('./errors');

// TODO: Create a JOI scheme for validation

/**
 * @typedef {Object} User
 * @property {string} user_id - The user's ID
 * @property {string} name - The user's name
 * @property {string} email - The user's email
 * @property {string|null} odoo_user_id - The user's Odoo ID
 * @property {string} oauth_id - The OAuth ID
 */


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


/**
 * Creates a new user with dynamic parameters.
 *
 * @param {Object} userData - Object containing user data fields
 * @returns {Promise<Object>} - The newly created user
 * @throws {DatabaseError} - If the database operation fails
 *
 * @example
 * createDBUser({ oauth_id: 12345, name: 'John Doe', email: 'john@example.com' })
 * createDBUser({ oauth_id: 12345, name: 'John Doe', email: 'john@example.com', created_at: DateTime.now().toISO() })
 */
const createDBUser = async (userData) => {
    // Start building the query dynamically
    const fields = Object.keys(userData);
    const placeholders = fields.map((_, index) => `$${index + 1}`);
    const values = Object.values(userData);

    // Construct the SQL query
    const query = `
        INSERT INTO users (${fields.join(', ')})
        VALUES (${placeholders.join(', ')})
        RETURNING *
    `;

    try {
        const result = await pool.query(query, values);
        return result.rows[0];
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

        return users[0];

    } catch (error) {
        handleQueryError(error, 'getUserUnique');
    }
};


const setUserOdooCredentials = async (user_id, credentials) => {
    const {odoo_user_id, encrypted_key, salt, partner_id} = credentials;

    if (!user_id || !odoo_user_id || !partner_id || !encrypted_key || !salt) {
        throw new ValidationError(
            ErrorCodes.VALIDATION.MISSING_PARAMETERS,
            `Missing required parameters.`,
        );
    }

    if (!Number.isInteger(user_id) || !Number.isInteger(odoo_user_id) || !Number.isInteger(partner_id)) {
        throw new ValidationError(
            ErrorCodes.VALIDATION.INVALID_PARAMETERS,
            `Invalid parameters.`,
        );
    }

    // Check if the user exists
    const user = await getUserUnique({user_id: user_id});
    if (!user) {
        throw new ValidationError(
            ErrorCodes.USER.NOT_FOUND,
            `User with ID: ${user_id} not found.`,
        );
    }

    const userTableQuery = `
        UPDATE users
        SET odoo_user_id    = $2::integer,
            odoo_partner_id = $3::integer
        WHERE user_id = $1::integer
    `;

    const odooUserKeyQuery = `
        INSERT INTO odoo_apikeys (user_id, key, salt)
        VALUES ($1::integer, $2, $3)
    `;

    try {
        await pool.query(userTableQuery, [user_id, odoo_user_id, partner_id]);
        await pool.query(odooUserKeyQuery, [user_id, encrypted_key, salt]);
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
        SELECT id as key_id, key, salt
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


const rotateOdooUserKey = async (user_id, old_key_id, new_key, new_salt) => {
    if (!user_id || !old_key_id || !new_key || !new_salt) {
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

        const insertResult = await pool.query(insertQuery, [user_id, new_key, new_salt]);
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


module.exports = {
    createDBUser,
    getUsers,
    getUserUnique,
    setUserOdooCredentials,
    getUserOdooCredentials,
    rotateOdooUserKey,
};