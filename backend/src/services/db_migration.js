/**
 * Migration service module
 * Handles database migrations programmatically using node-pg-migrate
 * @module services/dbMigration
 */

const path = require('path');
const logger = require('./logger');
const {GLOBAL_CONFIG} = require("#config");
const {runner} = require('node-pg-migrate');

/**
 * Build database connection URL from environment variables
 * @function buildConnectionUrl
 * @returns {string} PostgreSQL connection URL
 * @throws {Error} If required environment variables are missing
 */
const buildConnectionUrl = () => {
    return `postgresql://${process.env.STROHM_DB_USER}:${encodeURIComponent(process.env.STROHM_DB_PASSWORD)}@${process.env.STROHM_DB_HOST}:${process.env.STROHM_DB_PORT}/${process.env.STROHM_DB_NAME}`;
};

/**
 * Create database if it doesn't exist
 * Connects to the default 'postgres' database and creates the target database
 * @async
 * @function createDatabaseIfNotExists
 * @returns {Promise<boolean>} True if database was created, false if it already existed
 * @throws {Error} If database creation fails
 */
const createDatabaseIfNotExists = async () => {
    if (GLOBAL_CONFIG.ENV.IS_PRODUCTION) {
        logger.info('Skipping database creation in production environment');
        return false;
    }

    try {
        const {Pool} = require('pg');

        // Connect to the default postgres database
        const defaultPool = new Pool({
            user: process.env.STROHM_DB_USER,
            host: process.env.STROHM_DB_HOST,
            database: 'postgres',
            password: process.env.STROHM_DB_PASSWORD,
            port: process.env.STROHM_DB_PORT,
        });

        const client = await defaultPool.connect();
        try {
            // Check if database exists
            const result = await client.query(
                `SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1)`,
                [process.env.STROHM_DB_NAME]
            );

            if (!result.rows[0].exists) {
                logger.info(`Database '${process.env.STROHM_DB_NAME}' does not exist, creating it...`);
                await client.query(`CREATE DATABASE ${process.env.STROHM_DB_NAME}`);
                logger.info(`Database '${process.env.STROHM_DB_NAME}' created successfully`);
                return true;
            }

            logger.info(`Database '${process.env.STROHM_DB_NAME}' already exists`);
            return false;
        } finally {
            client.release();
            await defaultPool.end();
        }
    } catch (error) {
        logger.error('Error creating database:', error);
        throw error;
    }
};

/**
 * Run pending database migrations
 * @async
 * @function runMigrations
 * @returns {Promise<void>}
 * @throws {Error} If migration fails
 */
const runMigrations = async () => {
    try {
        const migrationsDirectory = path.join(__dirname, '../../migrations');
        const connectionUrl = buildConnectionUrl();

        logger.info('Starting database migrations...');

        const migrationsRan = await runner({
            databaseUrl: connectionUrl,
            dir: migrationsDirectory,
            direction: 'up',
            verbose: true,
            migrationsTable: 'pgmigrations',
        });

        if (migrationsRan.length === 0) {
            logger.info('No pending db migrations');
        } else {
            logger.info(`Successfully ran ${migrationsRan.length} db migration(s)}`, migrationsRan);
        }
    } catch (error) {
        logger.error('Failed to run migrations:', error);
        throw error;
    }
};

module.exports = {
    runMigrations,
    createDatabaseIfNotExists,
};

