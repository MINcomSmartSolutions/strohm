/**
 * @file Middleware for checking user consent status and enforcing consent requirements.
 *
 * This middleware ensures that authenticated users have provided valid consent
 * before accessing protected routes. It performs ONLY consent validation and
 * relies on the ensureAuthenticated middleware running first.
 *
 * **SINGLE RESPONSIBILITY**: This middleware ONLY checks consent status.
 * Authentication must be handled by ensureAuthenticated middleware before this runs.
 *
 * **ARCHITECTURAL INTEGRATION**: This middleware leverages the consent service
 * which uses direct database connections instead of the standard `db.[query]`
 * pattern used elsewhere in the application. This design choice provides
 * enhanced audit capabilities and specialized transaction handling for
 * GDPR compliance requirements.
 *
 * @module middlewares/consent
 * @exports requireConsent
 * @see {@link module:middlewares/ensureAuthenticated} Must run before this middleware
 * @see {@link module:services/consent} For underlying consent operations
 * @see {@link module:controllers/consent} For consent page handling
 */

const {hasLatestConsent} = require('#services/consent');
const logger = require('#services/logger');


/**
 * Express middleware that validates user consent status before allowing access to protected routes.
 *
 * **PREREQUISITE**: This middleware assumes that `ensureAuthenticated` has already run.
 * It expects `req.user` to be populated for existing users, or undefined for new users.
 *
 * This middleware performs ONLY consent validation. Authentication and user loading
 * are handled by the ensureAuthenticated middleware.
 *
 * @async
 * @function requireConsent
 * @param {Object} req - Express request object
 * @param {Object} req.user - User object populated by ensureAuthenticated (may be undefined for new users)
 * @param {string} req.user.user_id - Unique identifier for the authenticated user
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 *
 * @returns {void} Calls next() to continue middleware chain or redirects to /consent
 *
 * @description
 * Consent Validation Flow:
 * 1. Check if user exists (req.user is populated)
 * 2. If user exists:
 *    - Check if they have latest consent via `hasLatestConsent()`
 *    - If no consent, redirect to /consent
 *    - If has consent, call next()
 * 3. If user doesn't exist (new user):
 *    - Redirect to /consent (they need to give consent first)
 *
 * @security
 * Security Considerations:
 * - Enforces consent requirements for data protection compliance
 * - Provides audit trail through comprehensive logging
 * - On error, redirects to logout to prevent unauthorized access
 *
 * @see {@link module:middlewares/ensureAuthenticated} Must run before this middleware
 * @see {@link module:services/consent.hasLatestConsent} For consent validation logic
 *
 */
const requireConsent = async (req, res, next) => {
    const sessionId = req.sessionID || 'no-session';
    req.sessionId = sessionId;
    const log = logger.withSession(sessionId);

    try {
        // Check if user exists in database (populated by ensureAuthenticated middleware)
        if (req.user) {
            // User exists - check if they have latest consent
            const hasConsent = await hasLatestConsent(req.user);

            if (!hasConsent) {
                log.info(`User ${req.user.user_id} does not have latest consent - redirecting to consent page`);
                return res.redirect('/consent');
            }

            // User has consent - allow access
            log.debug(`User ${req.user.user_id} has valid consent`);
            return next();
        } else {
            // User doesn't exist in DB yet - they need to give consent first
            log.info('New user detected - redirecting to consent page');
            return res.redirect('/consent');
        }
    } catch (error) {
        // CRITICAL: Do NOT allow access on error - this is a security risk
        log.error('Critical error in consent middleware:', error);

        // Redirect to logout with error reason
        return res.redirect('/logout?reason=consent_validation_error');
    }
}

module.exports = {
    requireConsent
};
