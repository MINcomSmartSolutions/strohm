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
    baseURL: ODOO_CONFIG.URL,
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ODOO_ADMIN_API_KEY}`,
    },
    validateStatus: () => true,
});

const odooUserAxios = axios.create({
    baseURL: ODOO_CONFIG.URL,
    headers: {
        'Content-Type': 'application/json',
    },
    validateStatus: () => true,
});


const steveAxios = axios.create({
    baseURL: STEVE_CONFIG.URL,
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
            logger.error('Error connecting to SteVe: "' + response.status + '" returned. Response: ' + JSON.stringify(response.data));
            throw new Error('Failed to connect to SteVe');
        } else {
            logger.info('Steve connection successful');
        }
    })
    .catch(error => {
        logger.error('Error connecting to SteVe:' + error);
    });

// Test the connection to Odoo
odooAxios.get('/internal/admin/connection-check')
    .then(response => {
        if (response.status !== 200) {
            logger.error(`Error connecting to Odoo: "${response.status} returned. Response: ${JSON.stringify(response.data)}"`);
            throw new Error('Failed to connect to Odoo');
        } else {
            logger.info('Odoo connection successful');
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