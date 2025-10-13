/**
 * @file Controller for handling user authentication and logout.
 *
 * @module controllers/auth
 * @exports auth_controller
 */

const express = require('express');
const auth_controller = express();

const logger = require('#services/logger');


auth_controller.get('/logout', async (req, res) => {
    const reason = req.query.reason || null;
    const type = req.query.type || null;
    const message = req.query.message || null;

    let notificationData = null;
    if (message && type) {
        notificationData = {
            message: decodeURIComponent(message),
            type: type,
            title: req.query.title ? decodeURIComponent(req.query.title) : null
        }
    }

    // TODO: HERE NEEDS A REFACTOR TO AVOID THIS HUGE IF-ELSE CHAIN
    if (reason === 'consent_declined') {
        notificationData = {
            message: 'Sie müssen den Nutzungsbedingungen zustimmen, um fortzufahren.',
            type: 'warning',
            title: 'Zustimmung erforderlich'
        };
    } else if (reason === 'consent_withdrawn') {
        notificationData = {
            message: 'Ihre Zustimmung wurde erfolgreich widerrufen.',
            type: 'success',
            title: 'Zustimmung widerrufen'
        };
    } else if (reason === 'session_expired') {
        notificationData = {
            message: 'Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.',
            type: 'info',
            title: 'Sitzung abgelaufen'
        };
    } else if (reason === 'invalid_session') {
        notificationData = {
            message: 'Ihre Sitzung ist ungültig. Bitte melden Sie sich erneut an.',
            type: 'warning',
            title: 'Ungültige Sitzung'
        };
    } else if (reason === 'account_deactivated') {
        notificationData = {
            message: 'Ihr Konto wurde deaktiviert. Bitte kontaktieren Sie den Support.',
            type: 'error',
            title: 'Konto deaktiviert'
        };
    } else if (reason === 'consent_system_error') {
        notificationData = {
            message: 'Das Zustimmungssystem ist derzeit nicht verfügbar. Bitte versuchen Sie es später erneut.',
            type: 'error',
            title: 'Systemfehler'
        };
    } else if (reason === 'consent_validation_error') {
        notificationData = {
            message: 'Bei der Überprüfung Ihrer Zustimmung ist ein Fehler aufgetreten. Bitte melden Sie sich erneut an.',
            type: 'error',
            title: 'Validierungsfehler'
        };
    } else if (reason === 'odoo_conflict') {
        notificationData = {
            message: 'Es besteht ein Konflikt mit Ihrem Odoo-Konto. Bitte kontaktieren Sie den Support.',
            type: 'error',
            title: 'Odoo-Konflikt'
        };
    } else if (reason === 'odoo_login_error') {
        notificationData = {
            message: 'Die Anmeldung beim Portal ist fehlgeschlagen. Bitte versuchen Sie es erneut.',
            type: 'error',
            title: 'Anmeldefehler'
        };
    } else if (reason === 'error') {
        notificationData = {
            message: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.',
            type: 'error',
            title: 'Fehler'
        };
    }

    // If we have a notification, we need to pass it through the OIDC logout redirect
    if (notificationData) {
        // Build the returnTo URL with notification parameters
        const params = new URLSearchParams({
            message: encodeURIComponent(notificationData.message),
            type: notificationData.type
        });

        if (notificationData.title) {
            params.append('title', encodeURIComponent(notificationData.title));
        }

        const returnTo = `/welcome?${params.toString()}`;

        req.session.destroy((err) => {
            if (err) {
                logger.error('Error destroying session:', err);
            }
        });

        return await res.oidc.logout({returnTo: returnTo});
    }

    // Normal logout without notification
    req.session.destroy((err) => {
        if (err) {
            logger.error('Error destroying session:', err);
        }
    });

    await res.oidc.logout({returnTo: '/welcome'});
});

// OIDC routes are already handled by the express-openid-connect middleware in the app.js file.

module.exports = auth_controller;