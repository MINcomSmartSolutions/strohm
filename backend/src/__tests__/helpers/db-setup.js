/**
 * @file Database test setup utility
 */
const {Pool} = require('pg');
const {execSync} = require('child_process');
const path = require('path');

// Load test environment variables
require('dotenv').config({path: path.resolve(__dirname, '../../../test.env')});

/**
 * Initialize a clean test database for integration tests
 */
const setupTestDatabase = async () => {

    if (!process.env.DB_USER || !process.env.DB_HOST || !process.env.DB_NAME || !process.env.DB_PASSWORD || !process.env.DB_PORT) {
        throw new Error('Database environment variables are not set. Please check your test.env file.');
    }

    // Start the test database container if it's not already running
    try {
        console.log('Starting test database container...');
        execSync('docker-compose -f docker-compose.test.yml up -d db-test', {
            stdio: 'inherit',
        });

        // Make sure the initialization script is executable
        execSync('chmod +x ./src/__tests__/helpers/db-init.sh', {
            stdio: 'inherit',
        });

        console.log('Running database initialization script...');
        execSync('./src/__tests__/helpers/db-init.sh', {
            stdio: 'inherit',
        });

    } catch (error) {
        console.error('Error setting up test database:', error);
        throw error;
    }

    // Create a new connection pool for tests
    return new Pool({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
    });
};

/**
 * Clear all data from test database tables
 * @param {Pool} pool - Database connection pool
 */
const clearTestData = async (pool) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Truncate all tables (adjust table names as needed based on your schema)
        await client.query(`
      TRUNCATE 
        users, 
        odoo_apikeys, 
        charging_transactions, 
        activity_log,
        watermark,
        electricity_prices
      CASCADE
    `);

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

/**
 * Insert test data for a standard test user
 * @param {Pool} pool - Database connection pool
 * @returns {Object} - Created test user
 */
const insertTestUser = async (pool) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Insert a test user
        const userResult = await client.query(`
            INSERT INTO users (oauth_id, name, email, rfid)
            VALUES ('test_oauth_id', 'Test User', 'test@example.com', 'test_rfid')
            RETURNING *
        `);

        const user = userResult.rows[0];

        await client.query('COMMIT');
        return user;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

/**
 * Insert Odoo credentials for a user
 * @param {Pool} pool - Database connection pool
 * @param {Object} user - User to add credentials for
 * @returns {Object} - Updated user with Odoo IDs
 */
const insertOdooCredentials = async (pool, user) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Update user with Odoo IDs
        const updateResult = await client.query(`
            UPDATE users
            SET odoo_user_id    = 1000,
                odoo_partner_id = 2000
            WHERE user_id = $1
            RETURNING *
        `, [user.user_id]);

        const updatedUser = updateResult.rows[0];

        // Insert API key
        await client.query(`
            INSERT INTO odoo_apikeys (user_id, key, salt)
            VALUES ($1, 'test_encrypted_key', 'test_salt')
        `, [user.user_id]);

        await client.query('COMMIT');
        return updatedUser;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

/**
 * Insert a test transaction
 * @param {Pool} pool - Database connection pool
 * @param {Object} user - User who owns the transaction
 * @returns {Object} - Created transaction
 */
const insertTestTransaction = async (pool, user) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const now = new Date();
        const startTime = new Date(now.getTime() - 3600000); // 1 hour ago

        // Notice that we removed delivered_energy_wh from the columns list
        // as it's a computed field in the database
        const txResult = await client.query(`
            INSERT INTO charging_transactions (tx_steve_id,
                                               ocpp_id_tag,
                                               start_timestamp,
                                               stop_timestamp,
                                               start_value,
                                               stop_value,
                                               user_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [
            12345,
            user.rfid,
            startTime,
            now,
            0,
            10, // stop_value - start_value = 10, which will be used to compute delivered_energy_wh
            user.user_id,
        ]);

        const transaction = txResult.rows[0];

        await client.query('COMMIT');
        return transaction;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

/**
 * Insert test electricity price
 * @param {Pool} pool - Database connection pool
 */
const insertElectricityPrice = async (pool) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(`
            INSERT INTO electricity_prices (price, valid_from)
            VALUES (35, NOW() - INTERVAL '1 day')
        `);

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

/**
 * Close database connection pool
 * @param {Pool} pool - Database connection pool to close
 */
const closePool = async (pool) => {
    await pool.end();
};

/**
 * Clean up test resources
 */
const teardownTestEnvironment = async () => {
    try {
        // Optional: Stop the test database container
        // execSync('docker-compose -f docker-compose.test.yml down', { stdio: 'inherit' });
    } catch (error) {
        console.error('Error tearing down test environment:', error);
    }
};

module.exports = {
    setupTestDatabase,
    clearTestData,
    insertTestUser,
    insertOdooCredentials,
    insertTestTransaction,
    insertElectricityPrice,
    closePool,
    teardownTestEnvironment,
};
