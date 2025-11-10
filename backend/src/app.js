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
const MemoryStore = require('memorystore')(session);
const logger = require('./services/logger');
const {startCronWithHealthCheck} = require('./services/cron');
const {Settings} = require('luxon');
const {morganMiddleware} = require('./services/logger');
const auth_controller = require('./controllers/auth');
const odoo_controller = require('./controllers/odoo');
const scim_controller = require('./controllers/scim');
const consent_controller = require('./controllers/consent');
const {ensureAuthenticated} = require('./middlewares/ensureAuthenticated');
const {requireConsent} = require('./middlewares/consent');
const {ensureTailscaleAccess} = require('./middlewares/tailscaleAuth');
const {GLOBAL_CONFIG} = require("#config");
const {AuthError, ErrorCodes, SystemError} = require("#utils/errors");

Settings.defaultZoneName = 'utc';
Settings.defaultLocale = 'de-DE';


// Handling response status codes where the respected function is called instead of axios throwing an error
axios.defaults.validateStatus = function () {
    return true;
};
axios.interceptors.response.use(function (response) {
    // Optional: Do something with response data
    return response;
}, function (error) {
    // Do whatever we want with the response error here:

    // But, be SURE to return the rejected promise, so the caller still has
    // the option of additional specialized handling at the call-site:
    return Promise.reject(error);
});


// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    proxy: GLOBAL_CONFIG.ENV.IS_PRODUCTION,
    store: new MemoryStore({
        checkPeriod: 86400000 // prune expired entries every 24h
    }),
    cookie: {
        secure: GLOBAL_CONFIG.ENV.IS_PRODUCTION,
        maxAge: 86400000, // 24 hours
    },
}));

if (GLOBAL_CONFIG.ENV.IS_PRODUCTION) {
    app.set('trust proxy', 1 /* number of proxies between user and server */);
}

app.use(express.urlencoded({extended: true}));
app.use(express.json());
app.use(morganMiddleware); // Custom logger middleware for request logging

// Serve static files from public directory
app.use(express.static('public'));


// Helps prevent HTTP Parameter Pollution attacks
// noinspection JSCheckFunctionSignatures
app.use(hpp());

// Helmet helps secure Express apps by setting various HTTP headers
// See: https://helmetjs.github.io/
let form_action_urls = [
    "'self'",
    "https://laden.hm.edu",
    "https://backend.laden.hm.edu",
];
if (!GLOBAL_CONFIG.ENV.IS_PRODUCTION) {
    form_action_urls.push("http://localhost:3000", "http://localhost:18069");
}

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline and unsafe-eval for inline scripts
            scriptSrcElem: ["'self'", "https://sso.hm.edu"], // External scripts
            styleSrc: ["'self'", "'unsafe-inline'", "https://sso.hm.edu", "https://assets.hm.edu"],
            styleSrcElem: ["'self'", "'unsafe-inline'", "https://sso.hm.edu", "https://assets.hm.edu"], // External stylesheets
            imgSrc: ["'self'", "data:", "https:", "https://assets.hm.edu", "https://mediapool.hm.edu"], // Allow images from same origin, data URIs, HTTPS, and mediapool
            connectSrc: ["'self'"],
            fontSrc: ["'self'", "https://assets.hm.edu", "https://sso.hm.edu"], // Allow fonts from same origin and external domains
            objectSrc: ["'none'"], // Block plugins (Flash, etc.)
            mediaSrc: ["'self'"], // Allow media from same origin
            frameSrc: ["'self'"], // Allow iframes from same origin
            formAction: form_action_urls,
        },
    },
    crossOriginEmbedderPolicy: false, // Needed for Auth0 OIDC compatibility
}));

// auth router attaches /login, /logout, and /callback routes to the baseURL
// See: https://github.com/auth0/express-openid-connect
app.use(auth(oidc_config));


app.get('/health', (req, res) => {
    res.status(200).json({success: true, msg: 'OK'});
});

app.get('/', ensureAuthenticated, requireConsent, async (req, res) => {
    try {
        // After ensureAuthenticated + requireConsent, req.user is guaranteed to exist and have consent
        if (!req.user) {
            logger.error('User missing after middleware - this should not happen');
            throw new AuthError(ErrorCodes.USER.NOT_FOUND);
        }

        // Check if user is deactivated
        if (req.user.deactivated_at !== null) {
            logger.warn(`User ${req.user.user_id} is deactivated`);
            throw new AuthError(ErrorCodes.AUTH.USER_INACTIVE);
        }

        try {
            logger.debug(`Getting Odoo portal login for user ${req.user.user_id}`);
            const redirect_url = await getOdooPortalLogin(req.user);
            logger.info(`Redirecting user ${req.user.user_id} to Odoo portal`);
            return res.redirect(redirect_url);
        } catch (error) {
            logger.error(`Failed to get Odoo portal login URL:`, error);
            throw new SystemError(ErrorCodes.SYSTEM.UNKNOWN_ERROR, null, error);
        }
    } catch (error) {
        logger.error(`Error in / route handler:`, error);
        appErrorHandler(error, res);
    }
});

app.get('/welcome', async (req, res) => {
    try {
        if (req.session.user) {
            return res.redirect('/');
        }
        // Serve the modern welcome page
        return res.sendFile('welcome.html', {root: 'public'});
    } catch (error) {
        appErrorHandler(error, res);
    }
});

app.get('/faq', async (req, res) => {
    try {
        return res.sendFile('faq.html', {root: 'public'});
    } catch (error) {
        appErrorHandler(error, res);
    }
});

app.use(auth_controller);

app.use(consent_controller);

app.use(odoo_controller);

app.use(scim_controller);

// Admin Panel - Protected by Tailscale network access
// Enable with TAILSCALE_ENABLE_ADMIN=true environment variable
if (GLOBAL_CONFIG.TAILSCALE?.ENABLE_ADMIN) {
    const dev_admin_controller = require('./controllers/dev_admin');

    logger.verbose('Admin Panel enabled - protected by Tailscale authentication');
    logger.info('Admin panel available at /dev-admin.html');
    logger.debug(`Allowed Tailscale ranges: ${GLOBAL_CONFIG.TAILSCALE.ALLOWED_RANGES.join(', ')}`);
    if (GLOBAL_CONFIG.TAILSCALE.ALLOWED_IPS.length > 0) {
        logger.info(`Allowed specific IPs: ${GLOBAL_CONFIG.TAILSCALE.ALLOWED_IPS.join(', ')}`);
    }

    // Apply Tailscale authentication to all admin routes
    app.use('/api/dev/{*any}', ensureTailscaleAccess);
    app.get('/dev-admin.html', ensureTailscaleAccess, (req, res) => {
        res.sendFile('dev-admin.html', {root: 'public'});
    });

    // API routes
    app.get('/api/dev/users', dev_admin_controller.getAllUsers);
    app.post('/api/dev/users/:user_id/steve/block', dev_admin_controller.blockUserInSteve);
    app.post('/api/dev/users/:user_id/steve/unblock', dev_admin_controller.unblockUserInSteve);
    app.delete('/api/dev/users/:user_id/steve', dev_admin_controller.deleteUserFromSteve);
    app.post('/api/dev/users/:user_id/steve/change-rfid', dev_admin_controller.changeRFIDofUser);
    app.post('/api/dev/users/:user_id/db/deactivate', dev_admin_controller.deactivateUserInDB);
    app.post('/api/dev/users/:user_id/db/activate', dev_admin_controller.activateUserInDB);
    app.delete('/api/dev/users/:user_id/db', dev_admin_controller.deleteUserFromDB);
    app.post('/api/dev/users/:user_id/odoo/revoke', dev_admin_controller.revokeOdooCredentials);
} else {
    logger.info('Admin Panel disabled - set TAILSCALE_ENABLE_ADMIN=true to enable');
}

startCronWithHealthCheck();


module.exports = app;