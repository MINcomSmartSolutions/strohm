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
// const swaggerSpec = require('./utils/swaggerConfig');
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
Settings.defaultZoneName = 'utc';
// Handling response status codes where the respected function is called instead of axios throwing an error
axios.defaults.validateStatus = function () {
    return true;
};

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
app.use(morganMiddleware);
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

// ODOO INCOMING WEBHOOKS
app.post('/internal/user/sync', verifyApiKey, async (req, res) => {
    try {
        const {user_id: req_odoo_userid, partner_id: req_odoopartnerid, event, data} = req.body;

        if (!event || !data) {
            logger.error('Invalid request body for Odoo webhook', {body: req.body});
            return res.status(400).json({error: 'Invalid request body'});
        }

        logger.info(`Received Odoo webhook event: ${event}`, {data});

        const user = await db.getUserUnique({odoo_user_id: req_odoo_userid, odoo_partner_id: req_odoopartnerid});
        if (!user) {
            logger.warn(`User not found for Odoo user ID: ${req_odoo_userid} and partner ID: ${req_odoopartnerid}`);
            return res.status(400).json({error: 'User not found'});
        }

        if (event === 'user_deleted' || event === 'partner_deleted') {
            await db.deactivateUser(user);
            await blockSteveUser(user);
        } else if (event === 'user_changed' || event === 'partner_changed') {
            // TODO: Handle user update, the main details comes from partner_updated event
            return res.status(200).json({success: true});
        }

        return res.status(200).json({success: true});
    } catch (error) {
        appErrorHandler(error, res);
    }
});

// Start the cron job
transactionFetchLoop.start();


module.exports = app;