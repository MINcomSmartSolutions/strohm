'use strict';
/**
 * @file Middleware for ensuring user authentication via OIDC and loading user data.
 *
 * This middleware validates OIDC authentication and ensures that the user exists
 * in the application database. It acts as the authentication layer that must pass
 * before any authorization checks (like consent) are performed.
 *
 * **SINGLE RESPONSIBILITY**: This middleware ONLY handles authentication.
 * It does NOT check consent or other authorization concerns.
 *
 * @module middlewares/ensureAuthenticated
 * @exports ensureAuthenticated
 */

const {validateOIDCProperties} = require('#helpers/auth');
const {db} = require('#utils/queries');
const {clearSession} = require('#utils/session');
const logger = require('#services/logger');
const {saveSession} = require("#utils/session");

/**
 * Express middleware that validates OIDC authentication and loads user data.
 *
 * This middleware ensures that:
 * 1. OIDC authentication is valid
 * 2. User exists in the database
 * 3. User data is loaded into req.user
 * 4. Session is synchronized with database state
 *
 * After this middleware runs successfully, you can trust that:
 * - req.user is populated with current database user data
 * - OIDC authentication is valid and not expired
 * - User exists in the system
 *
 * @async
 * @function ensureAuthenticated
 * @param {Object} req - Express request object
 * @param {Object} req.oidc - Auth0 OIDC object
 * @param {Object} req.oidc.user - OIDC user object
 * @param {string} req.oidc.user.sub - OAuth subject identifier
 * @param {Object} req.session - Express session object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 *
 * @returns {void} Calls next() on success or redirects on failure
 *
 * @description
 * Authentication Flow:
 * 1. Validate OIDC properties (token validity, expiration, etc.)
 * 2. Query database for user by oauth_id
 * 3. If user exists:
 *    - Load user into req.user
 *    - Synchronize session if needed
 *    - Call next()
 * 4. If user doesn't exist:
 *    - This means they haven't given consent yet
 *    - They'll be handled by consent middleware later
 *    - Still call next() to allow access to /consent route
 * 5. If OIDC validation fails:
 *    - Clear session and redirect to welcome page
 *
 */
const ensureAuthenticated = async (req, res, next) => {
    const sessionId = req.sessionID || 'no-session';
    req.sessionId = sessionId;
    const log = logger.withSession(sessionId);

    try {

        // First check and most important: Is the user trusted by the OIDC library?
        if (!req.oidc.isAuthenticated()) {
            await clearSession(req);
            return res.redirect('/welcome');
        }

        // Step 1: Validate OIDC authentication
        if (!await validateOIDCProperties(req)) {
            log.warn('OIDC validation failed in ensureAuthenticated');
            await clearSession(req);
            return res.redirect('/welcome');
        }

        // Step 2: Get OIDC user info
        const oidcUser = req.oidc.user;
        log.debug(`Authenticating user with oauth_id: ${oidcUser.sub}`);

        // Step 3: Query database for user
        const user = await db.getUserUnique({oauth_id: oidcUser.sub});

        if (user) {
            // User exists in database
            log.debug(`User found: ${user.user_id}`);

            // Step 4: Populate req.user (this is our SINGLE SOURCE OF TRUTH for the request)
            req.user = user;

            // Step 5: Synchronize session for persistence across requests
            // Note: req.session.user is ONLY for persistence, always use req.user in your code
            const sessionUser = req.session.user;
            if (!sessionUser || sessionUser.user_id !== user.user_id) {
                log.debug(`Synchronizing session for user ${user.user_id}`);
                req.session.user = user;

                await saveSession(req);
            }

            log.debug(`Authentication successful for user ${user.user_id}`);
        } else {
            // User doesn't exist in database yet
            // This is OK - they might be on their way to /consent
            // We don't set req.user, so downstream middleware knows they're new
            log.debug(`New user (oauth_id: ${oidcUser.sub}) - not yet in database`);

            // Clear any stale session data
            if (req.session.user.sub && req.session.user.sub !== oidcUser.sub) {
                delete req.session.user;
            }
        }

        // Continue to next middleware
        return next();

    } catch (error) {
        log.error('Error in ensureAuthenticated middleware:', error);
        // On error, redirect to welcome page
        return res.redirect('/welcome');
    }
};

module.exports = {
    ensureAuthenticated
};

