/**
 * @file Controller for handling user consent pages and operations.
 *
 * @module controllers/consent
 * @exports consent_controller
 */

const express = require('express');
const consent_controller = express.Router();
const {getActiveConsentRevision, recordConsent, withdrawConsent, hasLatestConsent} = require('../services/consent');
const {appErrorHandler, SystemError, ErrorCodes} = require('../utils/errors');
const logger = require('../services/logger');
const fs = require('fs');
const path = require('path');

/**
 * Display the consent page
 */
consent_controller.get('/consent', async (req, res) => {
    try {
        if (!req.oidc.isAuthenticated()) {
            return res.redirect('/login');
        }

        const activeConsent = await getActiveConsentRevision();
        if (!activeConsent) {
            logger.error('No active consent revision found');
            throw new SystemError(ErrorCodes.SYSTEM.SERVICE_UNAVAILABLE, 'No active consent revision available');
        }

        // Check if user already has latest consent
        if (req.session.user) {
            const hasConsent = await hasLatestConsent(req.session.user.user_id);
            if (hasConsent) {
                return res.redirect('/');
            }
        }

        // Read the HTML template file
        const templatePath = path.join(__dirname, '../../public/consent/consent.html');
        let htmlTemplate = fs.readFileSync(templatePath, 'utf8');

        // Replace placeholders with dynamic content
        htmlTemplate = htmlTemplate.replace(/{{TITLE}}/g, activeConsent.title);
        htmlTemplate = htmlTemplate.replace(/{{CONTENT}}/g, activeConsent.content.replace(/\n/g, '<br>'));

        // Generate links section if URLs are provided
        let linksSection = '';
        if (activeConsent.privacy_policy_url || activeConsent.terms_url) {
            linksSection = '<div class="links">';
            if (activeConsent.privacy_policy_url) {
                linksSection += `<a href="${activeConsent.privacy_policy_url}" target="_blank">Datenschutzbestimmungen</a>`;
            }
            if (activeConsent.terms_url) {
                linksSection += `<a href="${activeConsent.terms_url}" target="_blank">Bedingungen der Dienstleistung</a>`;
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
 * Handle consent form submission
 */
consent_controller.post('/consent', async (req, res) => {
    try {
        if (!req.oidc.isAuthenticated()) {
            return res.redirect('/login');
        }

        const {consent_given} = req.body;

        if (!consent_given) {
            return res.status(400).send(`
                <script>
                    alert('Sie müssen die Bedingungen akzeptieren, um fortzufahren.');
                    window.history.back();
                </script>
            `);
        }

        const activeConsent = await getActiveConsentRevision();
        if (!activeConsent) {
            logger.error('No active consent revision found during submission');
            throw new SystemError(ErrorCodes.SYSTEM.SERVICE_UNAVAILABLE, 'No active consent revision available');
        }

        // Get user info from OIDC session (stored during afterCallback)
        const oidcUser = req.session.oidc_userinfo;

        if (!oidcUser || !oidcUser.sub) {
            logger.error('No OIDC user info found in session');
            return res.status(500).send('Authentication error. Please try logging in again.');
        }

        // Check if user already exists
        const {db} = require('../utils/queries');
        let user = await db.getUserUnique({oauth_id: oidcUser.sub});

        if (!user) {
            // Create user ONLY AFTER consent is given
            logger.info(`Creating new user after consent for OIDC ID: ${oidcUser.sub}`);

            // Create the user first
            const {userOperations} = require('../services/user_operations');
            user = await userOperations(oidcUser);
        }

        // Record the consent AFTER user creation (if new user) or for existing user
        const ipAddress = req.ip || req.connection.remoteAddress || req.socket.remoteAddress ||
            (req.connection.socket ? req.connection.socket.remoteAddress : null);
        const userAgent = req.get('User-Agent');

        await recordConsent(user.user_id, activeConsent.id, ipAddress, userAgent);

        // Store user in session
        req.session.user = user;

        logger.info(`Consent recorded and user session created for user ${user.user_id}`);

        // Redirect to home page
        res.redirect('/');
    } catch (error) {
        logger.error('Error processing consent submission:', error);
        appErrorHandler(error, res);
    }
});

/**
 * Handle consent withdrawal
 */
consent_controller.post('/consent/withdraw', async (req, res) => {
    try {
        if (!req.oidc.isAuthenticated() || !req.session.user) {
            return res.status(401).json({error: 'Unauthorized'});
        }

        const success = await withdrawConsent(req.session.user.user_id);

        if (success) {
            // Clear session and redirect to logout
            req.session.destroy((err) => {
                if (err) {
                    logger.error('Error destroying session after consent withdrawal:', err);
                }
            });

            res.json({success: true, message: 'Consent withdrawn successfully'});
        } else {
            res.status(404).json({error: 'No active consent found to withdraw'});
        }
    } catch (error) {
        logger.error('Error withdrawing consent:', error);
        appErrorHandler(error, res);
    }
});

module.exports = consent_controller;
