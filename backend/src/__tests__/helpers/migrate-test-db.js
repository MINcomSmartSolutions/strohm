/**
 * Helper script to run migrations for test database
 * Can be used standalone or called from other scripts
 * or: npm run test:db:migrate
 */

const path = require('path');
const {runner} = require('node-pg-migrate');
const logger = require("#services/logger");

const migrateTestDatabase = async () => {
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
        const migrationsDirectory = path.join(__dirname, '../../../migrations');
        const connectionUrl = `postgresql://${STROHM_DB_USER}:${encodeURIComponent(STROHM_DB_PASSWORD)}@${STROHM_DB_HOST}:${STROHM_DB_PORT}/${STROHM_DB_NAME}`;

        console.log('Running database migrations for test database...');
        console.log(`Using migrations directory: ${migrationsDirectory}`);

        const migrationsRan = await runner({
            databaseUrl: connectionUrl,
            dir: migrationsDirectory,
            direction: 'up',
            verbose: true,
            migrationsTable: 'pgmigrations',
        });

        if (migrationsRan.length === 0) {
            console.log('No pending db migrations');
        } else {
            logger.info(`Successfully ran ${migrationsRan.length} db migration(s)}`, migrationsRan);
        }

        process.exit(0);
    } catch (error) {
        console.error('Failed to run migrations:', error);
        process.exit(1);
    }
};

migrateTestDatabase();

