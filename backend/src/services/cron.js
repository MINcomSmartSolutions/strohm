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
const {info} = require('./logger');

const transactionFetchLoop = new CronJob('20 * * * * *', async () => {
    const response = await runIncremental();
    info('Cron job executed successfully', response);
});

module.exports = {
    transactionFetchLoop,
};

