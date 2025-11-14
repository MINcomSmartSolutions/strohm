/**
 * Helper script to reset test database
 * Drops all tables and re-runs migrations
 * Usage: node src/__tests__/helpers/reset-test-db.js
 * or: npm run test:db:reset
 */

const path = require('path');
const {Pool} = require('pg');
const {runner} = require('node-pg-migrate');
const logger = require("#services/logger");

const resetTestDatabase = async () => {
    const {
        STROHM_DB_USER,
        STROHM_DB_PASSWORD,
        STROHM_DB_HOST,
        STROHM_DB_PORT,
        STROHM_DB_NAME,
    } = process.env;

    if (!STROHM_DB_USER || !STROHM_DB_HOST || !STROHM_DB_NAME || !STROHM_DB_PASSWORD || !STROHM_DB_PORT) {
        throw new Error('Database environment variables are not set. Please check your .env.test file.');
    }

    try {
        const connectionUrl = `postgresql://${STROHM_DB_USER}:${encodeURIComponent(STROHM_DB_PASSWORD)}@${STROHM_DB_HOST}:${STROHM_DB_PORT}/${STROHM_DB_NAME}`;
        const migrationsDirectory = path.join(__dirname, '../../../migrations');

        // Drop all migrations
        console.log('Rolling back all migrations...');
        try {
            await runner({
                databaseUrl: connectionUrl,
                dir: migrationsDirectory,
                direction: 'down',
                verbose: true,
                migrationsTable: 'pgmigrations',
                count: 999, // Rollback all
            });
            console.log('All migrations rolled back successfully');
        } catch (error) {
            // It's okay if there are no migrations to rollback
            if (!error.message.includes('No migrations')) {
                console.warn('Warning during rollback:', error.message);
            }
        }

        // Clean up migration tracking table if it exists
        console.log('Cleaning up migration tracking table...');
        const pool = new Pool({
            user: STROHM_DB_USER,
            host: STROHM_DB_HOST,
            database: STROHM_DB_NAME,
            password: STROHM_DB_PASSWORD,
            port: STROHM_DB_PORT,
        });

        const client = await pool.connect();
        try {
            // Drop all tables and recreate pgmigrations
            await client.query('DROP SCHEMA public CASCADE');
            await client.query('CREATE SCHEMA public');
            console.log('All tables dropped and public schema recreated');
        } finally {
            client.release();
            await pool.end();
        }

        // Run all migrations fresh
        console.log('Running all migrations fresh...');
        const migrationsRan = await runner({
            databaseUrl: connectionUrl,
            dir: migrationsDirectory,
            direction: 'up',
            verbose: true,
            migrationsTable: 'pgmigrations',
        });

        logger.info(`Successfully ran ${migrationsRan.length} db migration(s)}`, migrationsRan);
        console.log('Test database reset completed successfully!');

        process.exit(0);
    } catch (error) {
        console.error('Failed to reset database:', error);
        process.exit(1);
    }
};

resetTestDatabase();

