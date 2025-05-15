/**
 * @file Network service module for external API clients.
 *
 * - Exports pre-configured Axios instances for Odoo and SteVe APIs.
 * - Tests connections to SteVe and Odoo on module load.
 *
 * @module services/network
 */
const axios = require('axios');
const logger = require('./logger');
const {STEVE_CONFIG, ODOO_CONFIG} = require('../config');


const odooAxios = axios.create({
    baseURL: ODOO_CONFIG.HOST,
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ODOO_ADMIN_API_KEY}`,
    },
});

const odooUserAxios = axios.create({
    baseURL: ODOO_CONFIG.HOST,
    headers: {
        'Content-Type': 'application/json',
    },
});

const steveAxios = axios.create({
    baseURL: STEVE_CONFIG.HOST,
    auth: {
        username: process.env.STEVE_AUTH_USERNAME,
        password: process.env.STEVE_API_PASSWORD,
    },
    headers: {
        'Content-Type': 'application/json',
    },
});

// Test the connection to Steve
steveAxios.get(STEVE_CONFIG.OCPP_TAGS_URI, {
    params: {
        idTag: 'NETWORK_TEST',
    },
})
    .then(response => {
        if (response.status !== 200) {
            logger.error('Error connecting to SteVe:', response.data);
            throw new Error('Failed to connect to SteVe');
        } else {
            logger.info('Steve connection successful:');
        }
    })
    .catch(error => {
        logger.error('Error connecting to SteVe:', error.message);
    });

// Test the connection to Odoo
// FIXME: Create a test endpoint in Odoo to check the connection. This check is merely to see if the server is reachable.
odooAxios.get('/')
    .then(response => {
        if (response.status !== 200) {
            logger.error(`Error connecting to Odoo:"${response.data}"`);
        } else {
            logger.info('Odoo connection successful:');
        }
    })
    .catch(error => {
        logger.error(`Error connecting to Odoo:"${error.message}"`);
    });


module.exports = {
    odooAxios,
    steveAxios,
    odooUserAxios,
};