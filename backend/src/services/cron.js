/**
 * @file Cron job service for periodic transaction fetching.
 *
 * - Schedules a job to run every 20 second.
 * - Calls runIncremental to fetch new transactions.
 * - Logs the result after each execution.
 *
 * @exports transactionFetchLoop: The configured CronJob instance.
 * @module services/cron
 */
const {CronJob} = require('cron');
const {runIncremental} = require('./steve_transactions');
const logger = require('./logger');

const intervalSeconds = process.env.STEVE_FETCH_INTERVAL || 120;
const cronExpression = `*/${intervalSeconds} * * * * *`; // Every 'intervalSeconds' seconds

const transactionFetchLoop = new CronJob(cronExpression, async () => {
    try {
        await runIncremental();
    } catch (error) {
        logger.error('Error during transaction fetch loop: ' + error.message);
    }
});

module.exports = {
    transactionFetchLoop,
};

