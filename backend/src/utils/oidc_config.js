/**
 * OIDC configuration for authentication middleware.
 * - Uses environment variables for secrets and endpoints.
 * - Customizes authorization parameters and routes.
 * - Handles user session after authentication callback.
 *
 * @module utils/oidc_config
 * @exports {Object} oidc_config - Configuration object for OIDC authentication.
 */
const axios = require('axios');
const {userOperations} = require('../services/user_operations');
const logger = require('../services/logger');

// noinspection JSUnusedGlobalSymbols
const oidc_config = {
    authRequired: false,
    // auth0Logout: true,
    secret: process.env.SERVER_OIDC_SECRET,
    baseURL: process.env.SERVER_OIDC_BASE_URL,
    clientID: process.env.SERVER_OIDC_CLIENT_ID,
    clientSecret: process.env.SERVER_OIDC_CLIENT_SECRET,
    issuerBaseURL: process.env.SERVER_OIDC_ISSUER_BASE_URL,
    authorizationParams: {
        response_type: 'code', // This requires to provide a client secret
        // audience: 'https://api.example.com/products',
        scope: 'openid profile email', // + rfid
    },
    routes: {
        logout: false, // Disable default logout route
        postLogoutRedirect: '/welcome',
    },
    /**
     * Handles user session after authentication.
     * - Fetches user info from OIDC provider.
     * - Attaches user data to session.
     * @param {Object} req - Express request object.
     * @param {Object} res - Express response object.
     * @param {Object} session - OIDC session object.
     * @param {Object} decodedState - Decoded OIDC state.
     * @returns {Promise<Object>} Updated session.
     */
    afterCallback: async (req, res, session, decodedState) => {
        const userInfo = await axios.get(process.env.SERVER_OIDC_ISSUER_BASE_URL + '/userinfo', {
            headers: {
                Authorization: `${session.token_type} ${session.access_token}`,
            },
        }).then(response => response.data)
            .catch(error => {
                logger.error('Error fetching user info OIDC:', error.message);
                return {};
            });

        req.session.user = await userOperations(userInfo);
        req.session.save(() => {
            logger.info('Session saved');
        });

        return {
            ...session,
        };
    },
};

module.exports = oidc_config;