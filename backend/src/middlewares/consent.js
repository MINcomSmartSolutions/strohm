/**
 * @file Middleware for checking user consent status.
 *
 * @module middlewares/consent
 * @exports requireConsent
 */

const {hasValidConsent, getActiveConsentRevision, hasLatestConsent} = require('../services/consent');
const logger = require('../services/logger');

/**
 * Middleware to check if authenticated user has valid consent
 * Redirects to consent page if no valid consent exists
 */
const requireConsent = async (req, res, next) => {
    try {
        // Skip consent check for certain routes
        const skipRoutes = ['/consent', '/logout', '/health', '/welcome', '/login', '/callback'];
        const isSkipRoute = skipRoutes.some(route => req.path.startsWith(route));

        if (isSkipRoute) {
            return next();
        }

        // Only check consent for authenticated users
        if (!req.oidc.isAuthenticated()) {
            return next();
        }

        // Check if there's an active consent revision
        const activeConsent = await getActiveConsentRevision();
        if (!activeConsent) {
            logger.warn('No active consent revision found - allowing access without consent check');
            return next();
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

        next();
    } catch (error) {
        logger.error('Error in consent middleware:', error);
        // In case of error, allow the request to proceed to avoid blocking the entire application
        next();
    }
};

module.exports = {
    requireConsent
};
