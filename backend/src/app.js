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
const logger = require('./utils/logger');

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

// Handling response status codes where the respected function is called instead of axios throwing an error
axios.defaults.validateStatus = function () {
    return true;
};

app.use(express.urlencoded({extended: true}));
app.use(express.json());

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
        // console.log('Session user before login:', req.session.user);
        // console.log('OIDC session', req.oidc.user);
        if (req.oidc.isAuthenticated()) {
            if (req.session.user) {
                // User exists in session, redirect to Odoo portal
                const redirect_url = await getOdooPortalLogin(req.session.user.user_id);
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


// ODOO INCOMING WEBHOOKS
app.get('/internal/update_user', verifyApiKey, async (req, res) => {
    try {
        const {operation, record_id, old_data, new_data} = req.body;

        // Process the data based on operation (update/delete)
        console.log(`Portal user ${operation} - ID: ${record_id}`);

        // TODO: Handle the update or delete operation
        res.status(200).json({success: true});
    } catch (e) {
        appErrorHandler(e, res);
    }
});


module.exports = app;