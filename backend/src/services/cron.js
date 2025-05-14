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

