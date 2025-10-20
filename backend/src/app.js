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
const {db} = require('./utils/queries');
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
const {requireConsent} = require('./middlewares/consent');
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
app.use(helmet());


// auth router attaches /login, /logout, and /callback routes to the baseURL
// See: https://github.com/auth0/express-openid-connect
app.use(auth(oidc_config));

// Add consent middleware after OIDC auth but before protected routes
app.use(requireConsent);


app.get('/health', (req, res) => {
    res.status(200).json({success: true, msg: 'OK'});
});

app.get('/', async (req, res) => {

    try {
        if (req.oidc.isAuthenticated()) {
            const sessionUser = req.session.user || null;
            // Always working with the OIDC data, since session data can be stale/corrupted/missing/manipulated!
            const oidcUser = req.oidc.user;
            if (sessionUser) {
                const currentUser = await db.getUserUnique({oauth_id: oidcUser.sub});

                if (!currentUser) {
                    // User should've been already created but somehow is missing
                    logger.error(` Seems user consent --> creation did not worked properly. User with OIDC ID ${oidcUser.sub} not found in DB`);
                    throw new AuthError(ErrorCodes.USER.NOT_FOUND);
                }
                if (currentUser.user_id !== sessionUser.user_id) {
                    logger.warn(` Session user ${sessionUser.user_id} mismatch with database user ${currentUser.user_id}`);
                    throw new AuthError(ErrorCodes.AUTH.USER_MISMATCH);
                }
                if (currentUser.deactivated_at !== null) {
                    logger.warn(` User ${currentUser.user_id} is deactivated`);
                    throw new AuthError(ErrorCodes.AUTH.USER_INACTIVE);
                }

                try {
                    logger.debug(` Getting Odoo portal login for user ${sessionUser.user_id}`);
                    const redirect_url = await getOdooPortalLogin(sessionUser);
                    logger.info(` Redirecting user ${sessionUser.user_id} to Odoo portal`);
                    return res.redirect(redirect_url);
                } catch (error) {
                    logger.error(` Failed to get Odoo portal login URL:`, error);
                    // Caution: Redirecting to "/login, /, /welcome routes creates infinite redirect loop
                    throw new SystemError(ErrorCodes.SYSTEM.UNKNOWN_ERROR, null, error);
                }
            }
        }
        logger.debug(` User not authenticated or no session, redirecting to welcome`);
        return res.redirect('/welcome');
    } catch (error) {
        logger.error(` Error in / route handler:`, error);
        appErrorHandler(error, res);
    }
});

app.get('/welcome', async (req, res) => {
    try {
        if (req.session.user) {
            res.redirect('/');
        }
        // Serve the modern welcome page
        return res.sendFile('welcome.html', {root: 'public'});
    } catch (error) {
        appErrorHandler(error, res);
    }
});

app.use(auth_controller);

app.use(consent_controller);

app.use(odoo_controller);

app.use(scim_controller);

// Dev Admin Routes (only in development/test environments)
if (!GLOBAL_CONFIG.ENV.IS_PRODUCTION) {
    const dev_admin_controller = require('./controllers/dev_admin');

    logger.info('Dev Admin Panel enabled - available at /dev-admin.html');

    // API routes
    app.get('/api/dev/users', dev_admin_controller.getAllUsers);
    app.post('/api/dev/users/:user_id/steve/block', dev_admin_controller.blockUserInSteve);
    app.post('/api/dev/users/:user_id/steve/unblock', dev_admin_controller.unblockUserInSteve);
    app.delete('/api/dev/users/:user_id/steve', dev_admin_controller.deleteUserFromSteve);
    app.post('/api/dev/users/:user_id/db/deactivate', dev_admin_controller.deactivateUserInDB);
    app.post('/api/dev/users/:user_id/db/activate', dev_admin_controller.activateUserInDB);
    app.delete('/api/dev/users/:user_id/db', dev_admin_controller.deleteUserFromDB);
    app.post('/api/dev/users/:user_id/odoo/revoke', dev_admin_controller.revokeOdooCredentials);
}

startCronWithHealthCheck();


module.exports = app;