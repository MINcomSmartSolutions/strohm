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
const logger = require('./services/logger');
const {transactionFetchLoop} = require('./services/cron');
const {Settings} = require('luxon');
const {morganMiddleware} = require('./services/logger');
const auth_controller = require("./controllers/auth");
const odoo_controller = require("./controllers/odoo");

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

// noinspection JSCheckFunctionSignatures
app.use(hpp());
app.use(helmet());


// auth router attaches /login, /logout, and /callback routes to the baseURL
// See: https://github.com/auth0/express-openid-connect
app.use(auth(oidc_config));


app.get('/health', (req, res) => {
    res.status(200).json({success: true, msg: 'OK'});
});

app.get('/', async (req, res) => {
    try {
        if (req.oidc.isAuthenticated()) {
            if (req.session.user) {
                try {
                    // noinspection ES6RedundantAwait
                    const redirect_url = await getOdooPortalLogin(req.session.user);
                    return res.redirect(redirect_url);
                } catch (e) {
                    logger.warn('Failed to get Odoo portal login URL:', e.message);
                    return res.redirect('/welcome');
                }
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

app.use(auth_controller);

app.use(odoo_controller);


// Start the cron job
transactionFetchLoop.start();


module.exports = app;