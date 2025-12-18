/**
 * @file Cron job service for periodic transaction fetching and billing reconciliation.
 *
 * - Schedules a job to run every configured interval for transaction fetching.
 * - Schedules billing reconciliation to run every hour.
 * - Calls runIncremental to fetch new transactions.
 * - Logs the result after each execution.
 * - Monitors SteVe health and automatically stops/starts cron job based on availability.
 *
 * @exports transactionFetchLoop: The configured CronJob instance.
 * @exports billingReconciliationJob: The configured CronJob for billing reconciliation.
 * @module services/cron
 */
const {CronJob} = require('cron');
const {runIncremental, runFull} = require("#services/steve_transactions");
const {runBillingReconciliation, getUnbilledTransactionStats} = require('./billing_reconciliation');
const {checkSteveHealth, getSteveHealth} = require('./network');
const logger = require('./logger');
const {GLOBAL_CONFIG} = require("#config");

const intervalSeconds = process.env.STEVE_FETCH_INTERVAL || 120;
const cronExpression = `*/10 * * * * *`; // Every 'intervalSeconds' seconds

// Health check interval (check every 5 minutes)
const healthCheckInterval = 5 * 60 * 1000;
let healthCheckTimer = null;
let cronRunning = false;
let billingCronRunning = false;


const transactionFetchLoop = new CronJob(cronExpression, async () => {
        const healthStatus = getSteveHealth();
        if (!healthStatus.isHealthy) {
            logger.warn('Skipping transaction fetch - SteVe is unhealthy');
            return;
        }

        try {
            const result = await runIncremental();

            // If new transactions were fetched, immediately run billing reconciliation
            // to attempt billing for transactions with associated users
            if (result.completedTxnCount > 0) {
                const billingResult = await runBillingReconciliation({
                    olderThanHours: 0, // Don't wait, process immediately
                    limit: GLOBAL_CONFIG.ENV.IS_DEVELOPMENT ? null : result.completedTxnCount, // Process only the number of qualified transactions
                });

                if (billingResult.processed > 0) {
                    logger.info(`Immediate sending for processing to odoo: ${billingResult.orders_created} orders created, ${billingResult.invoices_created} invoices created, ${billingResult.failed} failed`);
                }
            }
        } catch (error) {
            logger.error('Error during transaction fetch loop', error);
            // Check health after error
            await checkSteveHealth();
        }
    },
    null, // onComplete
    false, // don't start immediately
    'UTC' // timezone
);

/**
 * Billing reconciliation job - runs every hour at minute 5
 * Attempts to:
 * 1. Associate users with previously unbilled transactions
 * 2. Create invoices for transactions that now have associated users
 */
const billingReconciliationJob = new CronJob(
    `30 22 * * *`, // Every day at 22:30 UTC
    async () => {
        const healthStatus = getSteveHealth();
        if (!healthStatus.isHealthy) {
            logger.warn('Skipping billing reconciliation - SteVe is unhealthy');
            return;
        }

        logger.info('Running scheduled billing reconciliation...');
        try {
            // Get stats first
            const stats = await getUnbilledTransactionStats();

            if (stats.total_unbilled > 0) {
                // Process up to 100 transactions that are at least 1 hour old
                await runBillingReconciliation();
                logger.info(`Unbilled transactions: ${stats.total_unbilled} total (${stats.unbilled_with_user} with user, ${stats.unbilled_without_user} without user)`);
            } else {
                logger.verbose('No unbilled transactions to process');
            }
        } catch (error) {
            logger.error('Error in scheduled billing reconciliation:', error);
        }
    },
    null, // onComplete
    true, // start immediately
    'UTC' // timezone
);

const transactionDailyFullRun = new CronJob(
    `15 22 * * *`, // Every day at 22:15 UTC
    async () => {
        const healthStatus = getSteveHealth();
        if (!healthStatus.isHealthy) {
            logger.warn('Skipping transaction full run - SteVe is unhealthy');
            return;
        }

        try {
            await runFull();
        } catch (error) {
            logger.error('Error during transaction full run: ', error);
            // Check health after error
            await checkSteveHealth();
        }
    },
    null, // onComplete
    false, // don't start immediately
    'UTC' // timezone
);


/**
 * Start the transaction fetch cron job with health monitoring
 */
function startCronWithHealthCheck() {
    if (!cronRunning) {
        transactionFetchLoop.start();
        transactionDailyFullRun.start();
        cronRunning = true;
        logger.info('Transaction fetch cron job started and will be run every ' + intervalSeconds + ' seconds');
    }

    // Start billing reconciliation job
    if (!billingCronRunning) {
        billingReconciliationJob.start();
        billingCronRunning = true;
        logger.info('Billing reconciliation cron job started and will run at 22:30 UTC daily');
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
        transactionDailyFullRun.stop();
        cronRunning = false;
        logger.info('Transaction fetch cron job stopped');
    }

    if (billingCronRunning) {
        billingReconciliationJob.stop();
        billingCronRunning = false;
        logger.info('Billing reconciliation cron job stopped');
    }

    if (healthCheckTimer) {
        clearInterval(healthCheckTimer);
        healthCheckTimer = null;
        logger.info('SteVe health monitoring stopped');
    }
}

/**
 * Get cron job status
 * @returns {{running: boolean, billingReconciliationRunning: boolean, steveHealth: object}}
 */
function getCronStatus() {
    return {
        running: cronRunning,
        billingReconciliationRunning: billingCronRunning,
        steveHealth: getSteveHealth(),
    };
}

module.exports = {
    transactionFetchLoop,
    billingReconciliationJob,
    startCronWithHealthCheck,
    stopCronWithHealthCheck,
    getCronStatus,
    runBillingReconciliation, // Export for manual triggering
    getUnbilledTransactionStats, // Export for manual queries
};
