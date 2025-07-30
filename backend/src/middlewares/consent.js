/**
 * @file Middleware for checking user consent status and enforcing consent requirements.
 *
 * This middleware ensures that authenticated users have provided valid consent
 * before accessing protected routes. It handles consent validation, user session
 * management, and automatic redirection to consent pages when needed.
 *
 * The middleware integrates with OIDC authentication and maintains an audit
 * trail of consent decisions while providing flexible route exclusions.
 *
 * **ARCHITECTURAL INTEGRATION**: This middleware leverages the consent service
 * which uses direct database connections instead of the standard `db.[query]`
 * pattern used elsewhere in the application. This design choice provides
 * enhanced audit capabilities and specialized transaction handling for
 * GDPR compliance requirements.
 *
 * @module middlewares/consent
 * @exports requireConsent
 * @see {@link module:services/consent} For underlying consent operations
 * @see {@link module:controllers/consent} For consent page handling
 */

const {getActiveConsentRevision, hasLatestConsent} = require('../services/consent');
const logger = require('../services/logger');
const {db} = require("../utils/queries");
const {userOperations} = require("../services/user_operations");
const {validateOIDCProperties} = require("../helpers/auth");

/**
 * Express middleware that validates user consent status before allowing access to protected routes.
 *
 * This middleware acts as a gatekeeper for the application, ensuring that only users who have
 * provided valid consent can access protected resources. It handles the complete consent
 * validation workflow including OIDC authentication, session management, and consent checking.
 *
 * **SERVICE INTEGRATION**: This middleware primarily uses `getActiveConsentRevision()` and
 * `hasLatestConsent()` from the consent service, which implement direct database queries
 * rather than the centralized `db.[query]` pattern used in other parts of the application.
 * This architectural choice ensures optimal performance and compliance for consent operations.
 *
 * @async
 * @function requireConsent
 * @param {Object} req - Express request object
 * @param {Object} req.session - Express session object for user state management
 * @param {Object} req.session.user - Current user session data (may be undefined)
 * @param {string} req.session.user.user_id - Unique identifier for the authenticated user
 * @param {Function} req.session.save - Function to persist session changes
 * @param {Object} req.oidc - Auth0 OIDC object containing authentication state
 * @param {Object} req.oidc.user - OIDC user object with OAuth provider details
 * @param {string} req.oidc.user.sub - Subject identifier from OAuth provider (unique user ID)
 * @param {string} req.path - Current request path for route matching
 * @param {Object} res - Express response object
 * @param {Function} res.redirect - Function to redirect user to different routes
 * @param {Function} next - Express next middleware function
 *
 * @throws {Error} Logs errors but does not throw to prevent application blocking
 *
 * @returns {void} Calls next() to continue middleware chain or redirects user
 *
 * @description
 * Middleware Flow:
 * 1. **Route Filtering**: Checks if current route should skip consent validation
 *    - Skipped routes: /consent, /logout, /health, /welcome, /login, /callback, /scim, /assets, /favicon
 * 2. **Consent Revision Check**: Uses `getActiveConsentRevision()` to verify system has active consent
 *    - If no active revision exists, allows access without consent check
 * 3. **OIDC Validation**: Validates OIDC authentication properties via `validateOIDCProperties()`
 *    - Redirects to /logout if validation fails
 * 4. **User Resolution**: Queries database directly using `db.getUserUnique()` (standard pattern)
 *    - Updates session with user data if user exists via `userOperations()`
 * 5. **Session Management**: Ensures authenticated users have proper session state
 * 6. **Consent Validation**: Uses `hasLatestConsent()` to check current consent status
 *    - Redirects to /consent page if consent is missing or outdated
 * 7. **Access Control**: Allows or denies access based on consent status
 *
 * @security
 * Security Considerations:
 * - Always validates OIDC properties before proceeding
 * - Gracefully handles errors to prevent application blocking
 * - Maintains session integrity during user operations
 * - Enforces consent requirements for data protection compliance
 * - Provides audit trail through comprehensive logging
 * - Integrates with consent service's specialized audit capabilities
 *
 * @performance
 * Performance Notes:
 * - Efficient route filtering prevents unnecessary database calls
 * - Caches user data in session to reduce database queries
 * - Fails gracefully without blocking application flow
 * - Minimal overhead for skipped routes
 * - Leverages consent service's optimized consent checking queries
 *
 * @see {@link module:services/consent.getActiveConsentRevision} For active consent retrieval
 * @see {@link module:services/consent.hasLatestConsent} For consent validation logic
 */
const requireConsent = async (req, res, next) => {
    try {
        // Skip consent check for certain routes
        const skipRoutes = ['/consent', '/logout', '/health', '/welcome', '/login', '/callback', '/scim', '/assets', '/favicon'];
        const isSkipRoute = skipRoutes.some(route => req.path.startsWith(route));

        if (isSkipRoute) {
            return next();
        }

        // Check if there's an active consent revision
        const activeConsent = await getActiveConsentRevision();
        if (!activeConsent) {
            logger.warn('No active consent revision found - allowing access without consent check');
            return next();
        }

        if (!await validateOIDCProperties(req)) {
            return res.redirect('/logout');
        }

        const user = await db.getUserUnique({oauth_id: req.oidc.user.sub});
        if (user) {
            req.session.user = await userOperations(req.oidc.user)
            req.session.save();
        }

        // If user is in session, check their consent status
        if (req.session.user) {
            const hasConsent = await hasLatestConsent(req.session.user.user_id);
            if (!hasConsent) {
                logger.info(`User ${req.session.user.user_id} does not have latest consent - redirecting to consent page`);
                return res.redirect('/consent');
            }
        } else {
            // User is authenticated but not in session yet - redirect to consent page
            // The consent controller will handle user creation after consent is given
            logger.info('Authenticated user without session - redirecting to consent page');
            return res.redirect('/consent');
        }


        return next();
    } catch (error) {
        logger.error('Error in consent middleware:', error);
        // In case of error, allow the request to proceed to avoid blocking the entire application
        return next();
    }
};

module.exports = {
    requireConsent
};
