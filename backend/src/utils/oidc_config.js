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

const {SystemError, ErrorCodes} = require("#utils/errors");
const axios = require('axios');
const {getOidcDiscovery} = require("#helpers/auth");
const logger = require("#services/logger");
const {userOperations} = require("#services/user_operations");
const {saveSession} = require("#utils/session");

const isAuth0 = process.env.SERVER_OIDC_ISSUER_BASE_URL.includes('auth0');
const oidc_config = {
    authRequired: false, // Allow unauthenticated access to some routes not all
    auth0Logout: isAuth0, // Set to issuer URL for Auth0, false for custom IdP
    // idpLogout: true, // FIXME: Sometimes some users log out from the portal but do not sign out from HM, so they are stuck in that state
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
    afterCallback: async (req, res, session) => {
        try {
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

            // TODO: Validate userInfo properties here if needed

            // Try to get user from database (don't create yet - that happens in consent flow)
            const user = await userOperations(userInfo, false);

            // Store user in session if found
            if (user) {
                req.session.user = user;
                await saveSession(req);
                logger.info(`User ${user.user_id} loaded in afterCallback`);
            } else {
                logger.info(`New user detected in afterCallback (oauth_id: ${userInfo.sub})`);
            }

            // Return session with userInfo attached - this makes req.oidc.user available
            // This is critical: even for new users who don't have a DB record yet,
            // we need the OIDC userInfo available so consent flow can access it
            return {
                ...session,
                user: userInfo, // This populates req.appSession.user with full userInfo
            };
        } catch (e) {
            // Even though it throws here, we return the session to avoid breaking the OIDC flow
            logger.warn('Warning in afterCallback:', e);

            // Return session as-is on error
            return {
                ...session,
            };
        }
    }
};

module.exports = oidc_config;