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
    getAllActiveConsentRevisions,
    getConsentPdf,
    recordConsent,
    withdrawConsent,
    hasLatestConsent,
    CONSENT_TYPES,
} = require('#services/consent');
const {appErrorHandler, SystemError, ErrorCodes, AuthError} = require('#utils/errors');
const logger = require('#services/logger');
const fs = require('fs');
const path = require('path');
const {userOperations} = require('#services/user_operations');
const {ensureAuthenticated} = require("#middlewares/ensureAuthenticated");
const {saveSession} = require("#utils/session");


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
consent_controller.get('/consent', ensureAuthenticated, async (req, res) => {
    const sessionId = req.sessionId || req.sessionID || 'no-session';
    req.sessionId = sessionId;
    const log = logger.withSession(sessionId);

    try {
        // Check if user already has latest consent
        if (req.user) {
            const hasConsent = await hasLatestConsent(req.user);
            if (hasConsent) {
                log.debug(`User ${req.user.user_id} already has latest consent`);
                return res.redirect('/');
            }
        }

        const activeConsents = await getAllActiveConsentRevisions();
        if (!activeConsents || activeConsents.length === 0) {
            log.error('No active consent revisions found');
            return res.redirect('/logout?reason=consent_system_error');
        }

        // Skip consent page if none of the revisions have a PDF uploaded yet
        const hasAnyPdf = activeConsents.some(c => !!c.pdf_filename);
        if (!hasAnyPdf) {
            log.warn('No consent revisions have PDFs uploaded yet - skipping consent page');
            return res.redirect('/');
        }

        log.debug('Rendering consent page for user:', req.user ? req.user.user_id : ['new user']);

        // Read the HTML template file
        const templatePath = path.join(__dirname, '../../public/consent/consent.html');
        let htmlTemplate = fs.readFileSync(templatePath, 'utf8');

        // Build consent documents data for the template
        const consentDocs = activeConsents.map(c => ({
            id: c.id,
            type: c.consent_type,
            title: c.title,
            version: c.version,
            hasPdf: !!c.pdf_filename,
            pdfFilename: c.pdf_filename,
            updatedAt: new Date(c.updated_at).toLocaleDateString('de-DE'),
        }));

        // Inject consent data as JSON for the client-side script
        htmlTemplate = htmlTemplate.replace(
            '{{CONSENT_DATA}}',
            JSON.stringify(consentDocs).replace(/</g, '\\u003c')
        );

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
consent_controller.post('/consent', ensureAuthenticated, async (req, res) => {
    const sessionId = req.sessionId || req.sessionID || 'no-session';
    req.sessionId = sessionId;
    const log = logger.withSession(sessionId);

    try {
        const {consent_given, consent_ids} = req.body;

        if (!consent_given) {
            log.info('User declined consent');
            return res.redirect('/logout?reason=consent_declined');
        }

        const userInfo = req.appSession.user || await req.oidc.fetchUserInfo();
        if (!userInfo) {
            throw new SystemError(ErrorCodes.SYSTEM.INVALID_SESSION, 'User info missing in session during consent processing');
        }

        const user = await userOperations(userInfo);

        // Double-check if user already has latest consent
        const hasConsent = await hasLatestConsent(user);
        if (hasConsent) {
            log.info(`User ${user.user_id} already has latest consent, redirecting to home page`);
            return res.redirect('/');
        }

        // Parse and validate consent_ids - user must consent to all active revisions
        let revisionIds;
        try {
            revisionIds = JSON.parse(consent_ids);
            if (!Array.isArray(revisionIds) || revisionIds.length === 0) {
                throw new Error('Invalid consent IDs');
            }
            revisionIds = revisionIds.map(id => parseInt(id, 10)).filter(id => Number.isFinite(id));
        } catch {
            return res.status(400).send(`
                <script>
                    alert('Ungültige Einwilligungsdaten. Bitte laden Sie die Seite neu.');
                    window.location.reload();
                </script>
            `);
        }

        // Verify that the submitted IDs match the current active revisions
        const activeConsents = await getAllActiveConsentRevisions();
        const activeIds = activeConsents.map(c => c.id).sort();
        const submittedIds = [...revisionIds].sort();

        if (JSON.stringify(activeIds) !== JSON.stringify(submittedIds)) {
            log.warn(`Consent revision mismatch: submitted ${submittedIds}, current ${activeIds}`);
            return res.status(400).send(`
                <script>
                    alert('Die Einverständniserklärung wurde aktualisiert. Bitte laden Sie die Seite neu.');
                    window.location.reload();
                </script>
            `);
        }

        const ipAddress = req.ip || req.connection.remoteAddress || req.socket.remoteAddress ||
            (req.connection.socket ? req.connection.socket.remoteAddress : null);
        const userAgent = req.get('User-Agent');

        // Record consent for each active revision
        for (const revisionId of revisionIds) {
            log.info(`Recording consent for user ${user.user_id}, revision ${revisionId}`);
            await recordConsent(user.user_id, revisionId, ipAddress, userAgent);
        }

        req.user = user;
        req.session.user = user;
        await saveSession(req);

        log.info(`Consent recorded and user session created for user ${user.user_id}`);

        const redirectUrl = req.session.returnTo || req.query.returnTo || '/';
        delete req.session.returnTo;
        res.redirect(redirectUrl);
    } catch (error) {
        log.error('Error processing consent submission:', error);
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
consent_controller.post('/consent/withdraw', ensureAuthenticated, async (req, res) => {
    try {
        // ensureAuthenticated middleware ensures req.user exists
        if (!req.user) {
            return res.status(401).json({error: 'User not authenticated'});
        }

        const success = await withdrawConsent(req.user.user_id);

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

/**
 * GET /consent/pdf/:id - Serve a consent PDF from the database
 *
 * Serves the PDF with restrictive headers to prevent JS execution.
 */
consent_controller.get('/consent/pdf/:id', async (req, res) => {
    try {
        const revisionId = parseInt(req.params.id, 10);
        if (!Number.isFinite(revisionId) || revisionId <= 0) {
            return res.status(400).json({error: 'Invalid revision ID'});
        }

        const pdf = await getConsentPdf(revisionId);
        if (!pdf) {
            return res.status(404).json({error: 'PDF not found'});
        }

        // Set restrictive headers
        // Use RFC 5987 encoding for filenames with non-ASCII characters (e.g. German umlauts)
        const safeFilename = pdf.pdf_filename.replace(/[^\x20-\x7E]/g, '_');
        const encodedFilename = encodeURIComponent(pdf.pdf_filename);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition',
            `inline; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`);
        res.setHeader('Content-Length', pdf.pdf_size);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        // Remove Helmet's CSP from the PDF response. Applying a CSP to a binary
        // application/pdf response is meaningless but actively breaks Firefox's
        // built-in PDF.js renderer which requires inline script execution.
        res.removeHeader('Content-Security-Policy');

        res.send(pdf.pdf_data);
    } catch (error) {
        logger.error('Error serving consent PDF:', error);
        appErrorHandler(error, res);
    }
});

/**
 * GET /agb - Display AGB consent PDF for viewing (publicly accessible)
 */
consent_controller.get('/agb', async (req, res) => {
    try {
        const activeConsent = await getActiveConsentRevision(CONSENT_TYPES.AGB);
        if (!activeConsent) {
            return res.redirect('/');
        }

        if (activeConsent.pdf_filename) {
            // Redirect to PDF endpoint
            return res.redirect(`/consent/pdf/${activeConsent.id}`);
        }

        // Fallback: render text content if no PDF
        const templatePath = path.join(__dirname, '../../public/consent/consent-view.html');
        if (!fs.existsSync(templatePath)) {
            return res.status(503).send('Vorlage nicht verfügbar');
        }
        let htmlTemplate = fs.readFileSync(templatePath, 'utf8');

        const escapeHtml = (text) => {
            return text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        htmlTemplate = htmlTemplate.replace(/{{TITLE}}/g, escapeHtml(activeConsent.title));
        htmlTemplate = htmlTemplate.replace(/{{CONTENT}}/g, (activeConsent.content || '').replace(/\n/g, '<br>'));
        htmlTemplate = htmlTemplate.replace(/{{VERSION}}/g, escapeHtml(activeConsent.version));
        htmlTemplate = htmlTemplate.replace(/{{LAST_UPDATED}}/g, escapeHtml(new Date(activeConsent.updated_at).toLocaleDateString('de-DE')));

        res.send(htmlTemplate);
    } catch (error) {
        logger.error('Error displaying AGB page:', error);
        appErrorHandler(error, res);
    }
});

/**
 * GET /datenschutz - Display Datenschutz consent PDF for viewing (publicly accessible)
 */
consent_controller.get('/datenschutz', async (req, res) => {
    try {
        const activeConsent = await getActiveConsentRevision(CONSENT_TYPES.DATENSCHUTZ);
        if (!activeConsent) {
            return res.redirect('/');
        }

        if (activeConsent.pdf_filename) {
            return res.redirect(`/consent/pdf/${activeConsent.id}`);
        }

        // Fallback: render text content
        const templatePath = path.join(__dirname, '../../public/consent/consent-view.html');
        if (!fs.existsSync(templatePath)) {
            return res.status(503).send('Vorlage nicht verfügbar');
        }
        let htmlTemplate = fs.readFileSync(templatePath, 'utf8');

        const escapeHtml = (text) => {
            return text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        htmlTemplate = htmlTemplate.replace(/{{TITLE}}/g, escapeHtml(activeConsent.title));
        htmlTemplate = htmlTemplate.replace(/{{CONTENT}}/g, (activeConsent.content || '').replace(/\n/g, '<br>'));
        htmlTemplate = htmlTemplate.replace(/{{VERSION}}/g, escapeHtml(activeConsent.version));
        htmlTemplate = htmlTemplate.replace(/{{LAST_UPDATED}}/g, escapeHtml(new Date(activeConsent.updated_at).toLocaleDateString('de-DE')));

        res.send(htmlTemplate);
    } catch (error) {
        logger.error('Error displaying Datenschutz page:', error);
        appErrorHandler(error, res);
    }
});

module.exports = consent_controller;
