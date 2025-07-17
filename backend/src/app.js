/**
 * Express app instance.
 * @module app
 */

const express = require('express');
const app = express();
// const cors = require('cors');
const hpp = require('hpp');
const helmet = require('helmet');
// const swaggerUi = require('swagger-ui-express');
// const swaggerSpec = require('./helpers/swaggerConfig');
const {auth} = require('express-openid-connect');
const oidc_config = require('./utils/oidc_config');
const {appErrorHandler} = require('./utils/errors');
const axios = require('axios');
const {getOdooPortalLogin} = require('./services/odoo');
const session = require('express-session');
const verifyApiKey = require('./middlewares/auth');
const logger = require('./services/logger');
const {runIncremental} = require('./services/steve_transactions');
const {transactionFetchLoop} = require('./services/cron');
const {Settings} = require('luxon');
const {morganMiddleware} = require('./services/logger');
const {db} = require('./utils/queries');
const {blockSteveUser} = require('./services/steve_user');
const Joi = require('joi');
Settings.defaultZoneName = 'utc';
// Handling response status codes where the respected function is called instead of axios throwing an error
axios.defaults.validateStatus = function () {
    return true;
};
axios.interceptors.response.use(function (response) {
    // Optional: Do something with response data
    return response;
}, function (error) {
    // Do whatever you want with the response error here:

    // But, be SURE to return the rejected promise, so the caller still has
    // the option of additional specialized handling at the call-site:
    return Promise.reject(error);
});

// TODO: Seperate to controllers folder


// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'a-very-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
}));

if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1 /* number of proxies between user and server */);
}

app.use(express.urlencoded({extended: true}));
app.use(express.json());
app.use(morganMiddleware); // Custom logger middleware for request logging


// auth router attaches /login, /logout, and /callback routes to the baseURL
// See: https://github.com/auth0/express-openid-connect
app.use(auth(oidc_config));

// noinspection JSCheckFunctionSignatures
app.use(hpp());
app.use(helmet());

app.get('/health', (req, res) => {
    res.status(200).json({success: true, msg: 'OK'});
});

app.get('/', async (req, res) => {
    try {
        if (req.oidc.isAuthenticated()) {
            if (req.session.user) {
                const redirect_url = await getOdooPortalLogin(req.session.user);
                return res.redirect(redirect_url);
            }
        }

        return res.redirect('/welcome');
    } catch (error) {
        appErrorHandler(error, res);
    }
});

app.get('/welcome', async (req, res) => {
    try {
        if (req.session.user) {
            res.redirect('/');
        }
        // TODO: Company banners, logos, etc.
        return res.send('<a href="/login">Login</a>');
    } catch (error) {
        appErrorHandler(error, res);
    }
});

app.get('/logout', async (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            logger.error('Error destroying session:', err);
        }
    });

    await res.oidc.logout({returnTo: '/welcome'});
});

app.get('/test', async (req, res) => {
    const values = await runIncremental();
    return res.send(values);
});


/**
 * Odoo internal user sync webhook endpoint.
 *
 * Expects a POST request with JSON body:
 * {
 *   user_id: \<number\>,            // Odoo user ID
 *   partner_id: \<number\>,         // Odoo partner ID
 *   event: \<string\>,              // One of: 'user_deleted', 'partner_deleted', 'user_changed', 'partner_changed', 'payment_rejected'
 *   data: {                         // Event-specific payload, e.g.:
 *     record_id: \<number\>,        // ID of the affected record
 *     old_data: \<object\>,         // Previous state (optional, for changed events)
 *     new_data: \<object\>          // New state (optional, for changed events)
 *   }
 * }
 *
 * - For 'user_deleted' or 'partner_deleted': deactivates user and blocks in Steve.
 * - For 'user_changed' or 'partner_changed': (TODO) update user details.
 * - For 'payment_rejected': (TODO) handle payment rejection logic.
 * - For 'payment_validity_changed': (TODO) handle payment validity changes.
 * Responds with 200 on success, 400 on invalid input or user not found.
 * Requires API key authentication via verifyApiKey middleware.
 */
app.post('/internal/user/sync', verifyApiKey, async (req, res) => {
    try {
        // Destructure expected fields from request body
        const {
            timestamp,
            user_id: req_odoo_userid,
            partner_id: req_odoo_partnerid,
            event,
            data,
        } = req.body;

        try {
            // Verify required fields using Joi (a bit unnecessary here, but good for consistency)
            Joi.assert(timestamp, Joi.string().isoDate().required());
            Joi.assert(req_odoo_userid, Joi.number().integer().positive());
            Joi.assert(req_odoo_partnerid, Joi.number().integer().positive());
            Joi.assert(event, Joi.string().valid(
                'user_deleted',
                'partner_deleted',
                'user_changed',
                'partner_changed',
                'payment_rejected',
                'payment_validity_changed',
            ).required());
            Joi.assert(data, Joi.object().required());
        } catch (validationError) {
            logger.error('Validation error in Odoo webhook request', {error: validationError.message, body: req.body});
            return res.status(400).json({error: 'Invalid request body'});
        }

        // console log body for debugging
        logger.debug(`Received Odoo webhook event: ${event}`, {data});

        // Fetch user by Odoo user and partner IDs
        const user = await db.getUserUnique({odoo_user_id: req_odoo_userid, odoo_partner_id: req_odoo_partnerid});
        if (!user) {
            logger.warn(`User not found for Odoo user ID: ${req_odoo_userid} and partner ID: ${req_odoo_partnerid}`);
            return res.status(400).json({error: 'User not found'});
        }

        // Handle deletion events
        if (event === 'user_deleted' || event === 'partner_deleted') {
            logger.info(`Handling deletion for user ${user.user_id}`);
            await db.deactivateUser(user);
            await blockSteveUser(user);
            await db.recordActivityLog(user.user_id, 'DELETE USER', 'ODOO', user.rfid);
            return res.status(200).json({success: true});
        } else if (event === 'user_changed' || event === 'partner_changed') {
            logger.info(`Handling user change for user ${user.user_id}`);
            // TODO: Handle user update, the main details comes from partner_updated event
            const {record_id, old_data, new_data} = data;
            Joi.assert(old_data, Joi.object().required());
            Joi.assert(new_data, Joi.object().required());

            return res.status(200).json({success: true});

        } else if (event === 'payment_validity_changed') {
            // TODO: Update user's payment method validity
            logger.info(`Payment validity change for user ${user.user_id}`);
            const {has_valid_payment_method} = data;
            Joi.assert(has_valid_payment_method, Joi.boolean());

            return res.status(200).json({success: true});

        } else if (event === 'payment_rejected') {
            // TODO: Handle payment_rejected event
            logger.info(`Payment rejected for user ${user.user_id}`);
            return res.status(200).json({success: true});
        }

        // Default success response
        return res.status(200).json({success: true});
    } catch (error) {
        appErrorHandler(error, res);
    }
});

// Start the cron job
transactionFetchLoop.start();


module.exports = app;