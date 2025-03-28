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
const oidc_config = require('./oidc/oidc_config');
const {userOperations} = require('./services/user_operations');
const {appErrorHandler, SystemError, ErrorCodes} = require('./utils/errors');

app.set('trust proxy', 1 /* number of proxies between user and server */);

app.use(express.urlencoded({extended: true}));
app.use(express.json());

// auth router attaches /login, /logout, and /callback routes to the baseURL
// See: https://github.com/auth0/express-openid-connect
app.use(auth(oidc_config));


// noinspection JSCheckFunctionSignatures
app.use(hpp());
app.use(helmet());

app.get('/server_health', (req, res) => {
    res.status(200).json({success: true, msg: 'OK'});
});

app.get('/', async (req, res) => {
    try {
        if (req.oidc.isAuthenticated()) {
            const user_check_successful = await userOperations(req.oidc.user);
            if (user_check_successful) {
                // Already authenticated user, redirect to odoo auto login URL with the parameters
                // return res.redirect('http://localhost:18069/');
                return res.send('Authenticated');
                // Send to the odoo portal or auto login?
            } else {
                throw SystemError(ErrorCodes.SYSTEM.UNKNOWN_ERROR, 'User check failed');
            }
        } else {
            // Render button to login
            return res.send('<a href="/login">Login</a>');
        }
    } catch (error) {
        appErrorHandler(error, res);
    }
});


module.exports = app;