const axios = require('axios');
const logger = require('./logger');
const {steve_config} = require('../config');


const odooAxios = axios.create({
    baseURL: process.env.ODOO_HOST,
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ODOO_ADMIN_API_KEY}`,
    },
});

const steveAxios = axios.create({
    baseURL: process.env.STEVE_BASE_URL,
    auth: {
        username: process.env.STEVE_AUTH_USERNAME,
        password: process.env.STEVE_API_PASSWORD,
    },
    headers: {
        'Content-Type': 'application/json',
    },
});

// Test the connection to Steve
steveAxios.get(steve_config.OCPP_TAGS_URL, {
    params: {
        idTag: 'NETWORK_TEST',
    },
})
    .then(response => {
        if (response.status !== 200) {
            logger.error('Error connecting to SteVe:', response.statusText);
            throw new Error('Failed to connect to SteVe');
        } else {
            logger.info('Connected to SteVe successfully');
        }
    })
    .catch(error => {
        console.error('Error connecting to SteVe:', error.message);
    });


module.exports = {
    odooAxios,
    steveAxios,
};