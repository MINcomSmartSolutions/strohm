/*
 * Database connection module using pg (node-postgres)
 * This module sets up a connection pool to a PostgreSQL database using environment variables for configuration.
 * Connection test is deferred until after database migrations to ensure tables exist.
 *
 * Warning: Do not use transactions with the pool.query method!
*/


const {Pool} = require('pg');
const logger = require('./logger');


// Create a new pool instance with connection parameters from environment variables
const pool = new Pool({
    user: process.env.STROHM_DB_USER,
    host: process.env.STROHM_DB_HOST,
    database: process.env.STROHM_DB_NAME,
    password: process.env.STROHM_DB_PASSWORD,
    port: process.env.STROHM_DB_PORT,
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

// Export testConnection so it can be called after migrations
module.exports = pool;
module.exports.testConnection = testConnection;
