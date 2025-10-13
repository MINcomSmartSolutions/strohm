/**
 * @file Controller for handling user consent pages and operations.
 *
 * This controller manages the complete consent workflow including:
 * - Displaying consent forms to users
 * - Processing consent submissions
 * - Handling consent withdrawals
 * - Validating user authentication and OIDC properties
 *
 * **ARCHITECTURAL INTEGRATION**: This controller heavily relies on the consent service
 * which implements direct database queries instead of the standard `db.[query]` pattern
 * used throughout the rest of the application. The consent service provides specialized
 * transaction handling and enhanced audit capabilities required for GDPR compliance.
 *
 * **SERVICE DEPENDENCIES**: The controller uses several key functions from the consent
 * service that bypass the centralized queries.js mechanism:
 * - `getActiveConsentRevision()` - Direct database query for active consent
 * - `recordConsent()` - Specialized audit trail recording with transactions
 * - `withdrawConsent()` - GDPR-compliant consent withdrawal with preservation
 * - `hasLatestConsent()` - Optimized consent validation queries
 *
 * @module controllers/consent
 * @exports consent_controller
 * @see {@link module:services/consent} For underlying consent operations
 * @see {@link module:middlewares/consent} For consent enforcement middleware
 */

const express = require('express');
const consent_controller = express.Router();
const {
    getActiveConsentRevision,
    recordConsent,
    withdrawConsent,
    hasLatestConsent,
} = require('#services/consent');
const {appErrorHandler, SystemError, ErrorCodes, AuthError} = require('#utils/errors');
const logger = require('#services/logger');
const fs = require('fs');
const path = require('path');
const {userOperations} = require('#services/user_operations');
const {validateOIDCProperties, createRequestId} = require('#helpers/auth');
const {db} = require('#utils/queries');
const {initializeConsent} = require("#utils/init-consent");


/**
 * GET /consent - Display the consent page to users
 *
 * This route handler renders the consent page with dynamic content from the active
 * consent revision. It validates user authentication, checks for existing consent,
 * and serves a customized HTML page based on the current consent requirements.
 *
 * **SERVICE INTEGRATION**: Uses `getActiveConsentRevision()` and `hasLatestConsent()`
 * from the consent service, which implement direct database queries rather than the
 * standard `db.[query]` pattern. This ensures optimal performance for consent validation.
 *
 * @async
 * @function
 * @param {Object} req - Express request object
 * @param {Object} req.session - Express session object
 * @param {Object} req.session.user - Current user session data
 * @param {string} req.session.user.user_id - Unique identifier for the user
 * @param {Object} req.oidc - Auth0 OIDC object containing user information
 * @param {Object} req.oidc.user - OIDC user object with OAuth details
 * @param {string} req.oidc.user.sub - Subject identifier from OAuth provider
 * @param {Object} res - Express response object
 *
 * @throws {AuthError} When OIDC properties validation fails
 * @throws {SystemError} When no active consent revision is available
 *
 * @returns {void} Sends HTML response or redirects to home page
 *
 * @description
 * Flow:
 * 1. Validates OIDC properties for authenticated user
 * 2. Retrieves active consent revision using consent service (bypasses queries.js)
 * 3. Checks if user already exists using standard `db.getUserUnique()` pattern
 * 4. If user has consent, redirects to home page using consent service validation
 * 5. Otherwise, renders consent page with dynamic content
 * 6. Replaces template placeholders with actual consent data
 * 7. Generates privacy policy and terms links if available
 *
 * @see {@link module:services/consent.getActiveConsentRevision} For consent retrieval
 * @see {@link module:services/consent.hasLatestConsent} For consent validation
 */
consent_controller.get('/consent', async (req, res) => {
    const requestId = req.requestId || createRequestId();
    req.requestId = requestId;

    try {
        const sessionUser = req.session ? req.session.user : null;

        // In this point either we need to have a valid user session or OIDC properties
        // If neither is present, redirect to logout to clear any invalid state
        if (!sessionUser && !(req.oidc && req.oidc.isAuthenticated())) {
            logger.warn(`[${requestId}] No user session or OIDC authentication found`);
            return res.redirect('/logout?reason=invalid_session');
        }

        if (!await validateOIDCProperties(req)) {
            logger.error(`[${requestId}] OIDC validation failed in consent GET`);
            throw new AuthError(ErrorCodes.AUTH.USER_INVALID);
        }

        // Get user info from OIDC session (now validated)
        const oidcUser = req.oidc.user;

        let user = await db.getUserUnique({oauth_id: oidcUser.sub});

        // Check if user already has latest consent. Here would not be reached because the middleware already checks it,
        // but in case someone disables the middleware for /consent route, this double-check ensures safety.
        if (user) {
            if (sessionUser) {
                const hasConsent = await hasLatestConsent(sessionUser.user_id);
                if (hasConsent) {
                    logger.debug(`[${requestId}] User ${sessionUser.user_id} has already latest consent`);
                    return res.redirect('/');
                }
            }
        }

        let activeConsent = await getActiveConsentRevision();
        if (!activeConsent) {
            logger.error(`[${requestId}] No active consent revision found`);
            await initializeConsent();
            activeConsent = await getActiveConsentRevision();
            if (!activeConsent) {
                return res.redirect('/logout?reason=consent_system_error')
            }
        }
        logger.debug(`[${requestId}] Rendering consent page for user:`, sessionUser ? sessionUser.user_id : 'not logged in');

        // Read the HTML template file
        const templatePath = path.join(__dirname, '../../public/consent/consent.html');
        let htmlTemplate = fs.readFileSync(templatePath, 'utf8');

        // Escape content to prevent XSS in consent content
        const escapeHtml = (text) => {
            return text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        // Replace placeholders with dynamic content (escaped)
        htmlTemplate = htmlTemplate.replace(/{{TITLE}}/g, escapeHtml(activeConsent.title));
        htmlTemplate = htmlTemplate.replace(/{{CONTENT}}/g, activeConsent.content.replace(/\n/g, '<br>'));
        htmlTemplate = htmlTemplate.replace(/{{VERSION}}/g, escapeHtml(activeConsent.version));

        // Generate links section if URLs are provided (validate URLs)
        let linksSection = '';
        if (activeConsent.privacy_policy_url || activeConsent.terms_url) {
            linksSection = '<div class="links">';
            if (activeConsent.privacy_policy_url) {
                // Validate URL is safe (starts with http/https)
                const privacyUrl = activeConsent.privacy_policy_url;
                if (privacyUrl.startsWith('http://') || privacyUrl.startsWith('https://')) {
                    linksSection += `<a href="${escapeHtml(privacyUrl)}" target="_blank" rel="noopener noreferrer">Datenschutzbestimmungen</a>`;
                }
            }
            if (activeConsent.terms_url) {
                // Validate URL is safe (starts with http/https)
                const termsUrl = activeConsent.terms_url;
                if (termsUrl.startsWith('http://') || termsUrl.startsWith('https://')) {
                    linksSection += `<a href="${escapeHtml(termsUrl)}" target="_blank" rel="noopener noreferrer">Bedingungen der Dienstleistung</a>`;
                }
            }
            linksSection += '</div>';
        }
        htmlTemplate = htmlTemplate.replace(/{{LINKS_SECTION}}/g, linksSection);

        // Send the processed HTML
        res.send(htmlTemplate);
    } catch (error) {
        logger.error('Error displaying consent page:', error);
        appErrorHandler(error, res);
    }
});

/**
 * POST /consent - Process consent form submission
 *
 * This route handler processes consent form submissions, validates the consent
 * decision, creates or updates user records, and establishes user sessions.
 * It leverages the consent service's specialized audit trail capabilities.
 *
 * **SERVICE INTEGRATION**: Uses `getActiveConsentRevision()` and `recordConsent()`
 * from the consent service. These functions implement direct database queries with
 * specialized transaction handling, bypassing the standard `db.[query]` pattern
 * for enhanced GDPR compliance and audit trail capabilities.
 *
 * One thing to consider in future is that, what if
 * - user opens two tabs with different consent versions and submits both?
 * - user submitted consent that is not the latest version?
 *
 * @async
 * @function
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body containing form data
 * @param {boolean} req.body.consent_given - User's consent decision (required)
 * @param {Object} req.session - Express session object for storing user data
 * @param {Object} req.oidc - Auth0 OIDC object containing user information
 * @param {Object} req.oidc.user - OIDC user object with OAuth details
 * @param {string} req.oidc.user.sub - Subject identifier from OAuth provider
 * @param {string} req.ip - Client IP address for consent recording
 * @param {Object} req.connection - Connection object for fallback IP extraction
 * @param {Object} res - Express response object
 *
 * @throws {AuthError} When OIDC properties validation fails
 * @throws {SystemError} When no active consent revision is available or session save fails
 *
 * @returns {void} Redirects to home page on success or shows error message
 *
 * @description
 * Flow:
 * 1. Validates OIDC properties for authenticated user
 * 2. Checks if consent was given in form submission
 * 3. If no consent, shows alert and returns user to previous page
 * 4. Retrieves active consent revision using consent service (bypasses queries.js)
 * 5. Creates or retrieves user record using standard `userOperations()` function
 * 6. Records consent using consent service's specialized audit trail recording
 * 7. Establishes user session with user data
 * 8. Redirects to home page on successful completion
 *
 * @see {@link module:services/consent.getActiveConsentRevision} For consent retrieval
 * @see {@link module:services/consent.recordConsent} For audit trail recording
 */
consent_controller.post('/consent', async (req, res) => {
    const requestId = req.requestId || createRequestId();
    req.requestId = requestId;

    try {
        if (!await validateOIDCProperties(req)) {
            logger.error(`[${requestId}] OIDC validation failed in consent POST`);
            throw new AuthError(ErrorCodes.AUTH.USER_INVALID);
        }

        const {consent_given, consent_version} = req.body;

        if (!consent_given) {
            logger.info(`[${requestId}] User declined consent`);
            return res.redirect('/logout?reason=consent_declined');
        }

        // Get user info from OIDC session (now validated)
        const oidcUser = req.oidc.user;

        logger.info(`[${requestId}] Creating user and external system accounts for oauth_id: ${oidcUser.sub}`);

        // Now we can create (or get if this is n-th consent given for the) user
        // This also creates Odoo and Steve users if they don't exist
        const user = await userOperations(oidcUser);

        // Do we have to check for existing consent here again, because the request couldn't have reached here if thay had the latest consent
        // unless the middleware was disabled for this route. But just in case, we double-check.
        // This also prevents multiple consent records for the same user if they submit the form multiple times.
        const hasConsent = await hasLatestConsent(user.user_id);
        if (hasConsent) {
            logger.info(`[${requestId}] User ${user.user_id} already has latest consent, redirecting to home page`);
            return res.redirect('/');
        }

        let activeConsent = await getActiveConsentRevision(); // A consent must exist if we are here, if not let it fail

        // Verify that the consent version matches the current active version
        if (consent_version && consent_version !== activeConsent.version) {
            logger.warn(`[${requestId}] Consent version mismatch: submitted ${consent_version}, current ${activeConsent.version}`);
            return res.status(400).send(`
                <script>
                    alert('Die Einverständniserklärung wurde aktualisiert. Bitte laden Sie die Seite neu.');
                    window.location.reload();
                </script>
            `);
        }

        // Record the consent AFTER user creation (if new user) or for existing user
        const ipAddress = req.ip || req.connection.remoteAddress || req.socket.remoteAddress ||
            (req.connection.socket ? req.connection.socket.remoteAddress : null);
        const userAgent = req.get('User-Agent');

        logger.info(`[${requestId}] Recording consent for user ${user.user_id}`);
        const consentRecord = await recordConsent(user.user_id, activeConsent.id, ipAddress, userAgent);

        // Store user in session with consent info
        req.session.user = {
            ...user,
            consent_version: activeConsent.version,
            consent_granted_at: consentRecord.consented_at
        };

        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) {
                    logger.error(`[${requestId}] Session save failed:`, err);
                    reject(new SystemError(ErrorCodes.SYSTEM.SESSION_SAVE_FAILED, null, err));
                } else {
                    resolve();
                }
            });
        });

        logger.info(`[${requestId}] Consent v${activeConsent.version} recorded and user session created for user ${user.user_id}`);

        // Check for redirect URL in session or query params
        const redirectUrl = req.session.returnTo || req.query.returnTo || '/';
        delete req.session.returnTo; // Clear the return URL after use

        // Redirect to the intended destination
        res.redirect(redirectUrl);
    } catch (error) {
        logger.error(`[${requestId}] Error processing consent submission:`, error);
        appErrorHandler(error, res);
    }
});

/**
 * POST /consent/withdraw - Handle consent withdrawal requests
 *
 * This route handler allows authenticated users to withdraw their previously
 * given consent, terminates their session, and prepares for logout. It uses
 * the consent service's GDPR-compliant withdrawal mechanism.
 *
 * **SERVICE INTEGRATION**: Uses `withdrawConsent()` from the consent service,
 * which implements specialized database operations that preserve audit trails
 * while marking consent as withdrawn. This bypasses the standard `db.[query]`
 * pattern to ensure GDPR Article 7(3) compliance.
 *
 * @async
 * @function
 * @param {Object} req - Express request object
 * @param {Object} req.oidc - Auth0 OIDC object for authentication check
 * @param {Function} req.oidc.isAuthenticated - Function to check authentication status
 * @param {Object} req.session - Express session object
 * @param {Object} req.session.user - Current user session data
 * @param {string} req.session.user.user_id - Unique identifier for the user
 * @param {Function} req.session.destroy - Function to destroy user session
 * @param {Object} res - Express response object
 *
 * @throws {Error} When consent withdrawal process fails
 *
 * @returns {void} Sends JSON response indicating success or failure
 *
 * @description
 * Flow:
 * 1. Validates user is authenticated via OIDC and has active session
 * 2. If not authenticated, returns 401 Unauthorized status
 * 3. Attempts to withdraw consent using consent service (bypasses queries.js)
 * 4. If successful, destroys user session to prepare for logout
 * 5. Returns JSON response with success status and message
 * 6. If no active consent found, returns 404 error
 * 7. Logs any session destruction errors for monitoring
 *
 *
 * @see {@link module:services/consent.withdrawConsent} For GDPR-compliant withdrawal
 */
consent_controller.post('/consent/withdraw', async (req, res) => {
    try {
        if (!req.oidc.isAuthenticated() || !req.session.user) {
            return res.status(401);
        }

        const success = await withdrawConsent(req.session.user.user_id);

        if (success) {
            // Clear session and redirect to logout with notification
            req.session.destroy((err) => {
                if (err) {
                    logger.error('Error destroying session after consent withdrawal:', err);
                }
            });

            res.json({
                success: true,
                message: 'Consent withdrawn successfully',
                redirectUrl: '/logout?reason=consent_withdrawn'
            });
        } else {
            res.status(404).json({error: 'No active consent found to withdraw'});
        }
    } catch (error) {
        logger.error('Error withdrawing consent:', error);
        appErrorHandler(error, res);
    }
});

module.exports = consent_controller;
