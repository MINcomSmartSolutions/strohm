// Validate environment variables before starting the server
const {validateEnvOrExit} = require('./src/utils/env-validator');
validateEnvOrExit();

/**
 * Starts the server and listens on the specified port.
 * @function
 * @name startServer
 * @param {number} port - The port number to listen on.
 * @returns {void}
 */
const port = process.env.SERVER_PORT || 3000;
const app = require('./src/app');
const {runMigrations} = require('./src/services/db_migration');
const pool = require('./src/services/db_conn');
const {GLOBAL_CONFIG} = require("#config");

// Run database migrations before starting the server
(async () => {
    try {
        // Only run migrations if not in test environment
        if (!GLOBAL_CONFIG.ENV.IS_TEST) {
            await runMigrations();
            // Test database connection after migrations
        }
        await pool.testConnection();

        app.listen(port, () => console.info(`Server listening on port ${port}`));
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
})();

