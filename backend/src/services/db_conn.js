/*
 * Database connection module using pg (node-postgres)
 * This module sets up a connection pool to a PostgreSQL database using environment variables for configuration.
 * It also includes a function to test the database connection upon initialization.
 *
 * Warning: Do not use transactions with the pool.query method!
*/


const {Pool} = require('pg');
const {DatabaseError, ErrorCodes} = require('#utils/errors');
const logger = require('./logger');


// Create a new pool instance with connection parameters from environment variables
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// Function to test database connection
const testConnection = async () => {
    const client = await pool.connect();
    try {
        await client.query('SELECT NOW()');
        logger.info('Database connection successful');
    } finally {
        client.release();
    }
};

// Test the connection when this module is imported only if not in test environment
if (process.env.NODE_ENV !== 'test') {
    testConnection().catch((error) => {
        throw new DatabaseError(ErrorCodes.DATABASE.CONNECTION_ERROR, error);
    });
}

module.exports = pool;