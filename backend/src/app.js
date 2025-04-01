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
const {userOperations, getOdooPortalLogin} = require('./services/user_operations');
const {appErrorHandler} = require('./utils/errors');
const axios = require('axios');

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

app.get('/server_health', (req, res) => {
    res.status(200).json({success: true, msg: 'OK'});
});

app.get('/', async (req, res) => {
    try {
        if (req.oidc.isAuthenticated()) {
            const user = await userOperations(req.oidc.user);
            console.log('User check passed');

            const redirectUrl = await getOdooPortalLogin(user.user_id);
            console.log('Redirect URL:', redirectUrl);

            return res.redirect(redirectUrl);
        } else {
            return res.redirect('/welcome');
        }
    } catch (error) {
        appErrorHandler(error, res);
    }
});

app.get('/welcome', async (req, res) => {
    try {
        // TODO: Company banners, logos, etc.
        return res.send('<a href="/login">Login</a>');
    } catch (error) {
        appErrorHandler(error, res);
    }
});


module.exports = app;