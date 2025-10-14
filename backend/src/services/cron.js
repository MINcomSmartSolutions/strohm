/**
 * @file Cron job service for periodic transaction fetching.
 *
 * - Schedules a job to run every 20 second.
 * - Calls runIncremental to fetch new transactions.
 * - Logs the result after each execution.
 * - Monitors SteVe health and automatically stops/starts cron job based on availability.
 *
 * @exports transactionFetchLoop: The configured CronJob instance.
 * @module services/cron
 */
const {CronJob} = require('cron');
const {runIncremental} = require('./steve_transactions');
const {checkSteveHealth, getSteveHealth} = require('./network');
const logger = require('./logger');

const intervalSeconds = process.env.STEVE_FETCH_INTERVAL || 120;
const cronExpression = `*/${intervalSeconds} * * * * *`; // Every 'intervalSeconds' seconds

// Health check interval (check every 5 minutes)
const healthCheckInterval = 5 * 60 * 1000;
let healthCheckTimer = null;
let cronRunning = false;

const transactionFetchLoop = new CronJob(cronExpression, async () => {
    const healthStatus = getSteveHealth();

    if (!healthStatus.isHealthy) {
        logger.warn('Skipping transaction fetch - SteVe is unhealthy');
        return;
    }

    try {
        await runIncremental();
    } catch (error) {
        logger.error('Error during transaction fetch loop: ' + error.message);
        // Check health after error
        await checkSteveHealth();
    }
});

/**
 * Start the transaction fetch cron job with health monitoring
 */
function startCronWithHealthCheck() {
    if (!cronRunning) {
        transactionFetchLoop.start();
        cronRunning = true;
        logger.info('Transaction fetch cron job started');
    }

    // Start periodic health checks
    if (!healthCheckTimer) {
        healthCheckTimer = setInterval(async () => {
            const wasHealthy = getSteveHealth().isHealthy;
            const isHealthy = await checkSteveHealth();

            // If health status changed, log it
            if (wasHealthy !== isHealthy) {
                if (isHealthy) {
                    logger.info('SteVe recovered - transaction fetching will resume');
                } else {
                    logger.warn('SteVe became unhealthy - transaction fetching paused');
                }
            }
        }, healthCheckInterval);

        logger.info(`SteVe health monitoring started (checking every ${healthCheckInterval / 1000}s)`);
    }
}

/**
 * Stop the transaction fetch cron job and health monitoring
 */
function stopCronWithHealthCheck() {
    if (cronRunning) {
        transactionFetchLoop.stop();
        cronRunning = false;
        logger.info('Transaction fetch cron job stopped');
    }

    if (healthCheckTimer) {
        clearInterval(healthCheckTimer);
        healthCheckTimer = null;
        logger.info('SteVe health monitoring stopped');
    }
}

/**
 * Get cron job status
 * @returns {{running: boolean, steveHealth: object}}
 */
function getCronStatus() {
    return {
        running: cronRunning,
        steveHealth: getSteveHealth(),
    };
}

module.exports = {
    transactionFetchLoop,
    startCronWithHealthCheck,
    stopCronWithHealthCheck,
    getCronStatus,
};
