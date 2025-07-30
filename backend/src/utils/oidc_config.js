'use strict';
/**
 * @file OIDC configuration for authentication middleware.
 *
 * - Uses environment variables for secrets and endpoints.
 * - Customizes authorization parameters and routes.
 *
 * @module utils/oidc_config
 * @exports {Object} oidc_config - Configuration object for OIDC authentication.
 */

const oidc_config = {
    authRequired: false, // Allow unauthenticated access to some routes not all
    auth0Logout: true,
    secret: process.env.SERVER_OIDC_SECRET,
    baseURL: process.env.SERVER_OIDC_BASE_URL,
    clientID: process.env.SERVER_OIDC_CLIENT_ID,
    clientSecret: process.env.SERVER_OIDC_CLIENT_SECRET,
    issuerBaseURL: process.env.SERVER_OIDC_ISSUER_BASE_URL,
    authorizationParams: {
        response_type: 'code', // This requires to provide a client secret
        scope: 'openid profile email', // + rfid
    },
    routes: {
        logout: false, // Disable default logout route
        postLogoutRedirect: '/welcome',
    },
};

module.exports = oidc_config;