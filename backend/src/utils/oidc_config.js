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

const {SystemError, ErrorCodes, AuthError} = require("#utils/errors");
const axios = require('axios');
const {getOidcDiscovery} = require("#helpers/auth");

const isAuth0 = process.env.SERVER_OIDC_ISSUER_BASE_URL.includes('auth0');
const oidc_config = {
    authRequired: false, // Allow unauthenticated access to some routes not all
    auth0Logout: isAuth0, // Set to issuer URL for Auth0, false for custom IdP
    // idpLogout: true,//
    secret: process.env.SERVER_OIDC_SECRET,
    baseURL: process.env.SERVER_OIDC_BASE_URL,
    clientID: process.env.SERVER_OIDC_CLIENT_ID,
    clientSecret: process.env.SERVER_OIDC_CLIENT_SECRET,
    issuerBaseURL: process.env.SERVER_OIDC_ISSUER_BASE_URL,
    authorizationParams: {
        response_type: 'code', // This requires to provide a client secret
        scope: 'openid profile email mifare',
    },
    routes: {
        logout: false, // Disable default logout route
    },
    afterCallback: async (req, res, session, decodedState) => {
        const oidcSpecifications = await getOidcDiscovery();
        const userInfoEndpoint = oidcSpecifications.userinfo_endpoint;

        const userInfo = await axios.get(userInfoEndpoint, {
            headers: {
                Authorization: `${session.token_type} ${session.access_token}`,
            },
        }).then(response => response.data)
            .catch(error => {
                throw new SystemError(ErrorCodes.SYSTEM.SERVICE_UNAVAILABLE, 'Failed to fetch userinfo', error);
            });


        // Store OIDC user info in session but do NOT create user account yet
        // User account will be created only after consent is given in the consent controller
        req.session.user = {oidc: userInfo}
        req.session.save(
            (err) => {
                if (err) {
                    // If fails here we cannot proceed because the session won't have the user info
                    throw new SystemError(ErrorCodes.SYSTEM.SESSION_SAVE_FAILED, 'Failed to save session after OIDC callback', err);
                }
            });

        return {
            ...session,
        };
    }
};

module.exports = oidc_config;