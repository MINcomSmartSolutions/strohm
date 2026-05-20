/**
 * @file Controller for handling user logout.
 *
 * @module controllers/auth
 * @exports auth_controller
 */

const express = require('express');
const auth_controller = express();

const {clearSession} = require("#utils/session");

auth_controller.get('/logout', async (req, res) => {
    const reason = req.query.reason || null;
    const type = req.query.type || null;
    const message = req.query.message || null;
    await clearSession(req);

    let notificationData = null;
    if (message && type) {
        notificationData = {
            message: decodeURIComponent(message),
            type: type,
            title: req.query.title ? decodeURIComponent(req.query.title) : null,
            persistent: req.query.persistent === 'true',
        }
    }

    const reasonNotifications = {
        consent_declined: {
            message: 'Sie müssen den Nutzungsbedingungen zustimmen, um fortzufahren.',
            type: 'warning',
            title: 'Zustimmung erforderlich'
        },
        consent_withdrawn: {
            message: 'Ihre Zustimmung wurde erfolgreich widerrufen.',
            type: 'success',
            title: 'Zustimmung widerrufen'
        },
        session_expired: {
            message: 'Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.',
            type: 'info',
            title: 'Sitzung abgelaufen'
        },
        invalid_session: {
            message: 'Ihre Sitzung ist ungültig. Bitte melden Sie sich erneut an.',
            type: 'warning',
            title: 'Ungültige Sitzung'
        },
        account_deactivated: {
            message: 'Ihr Konto wurde deaktiviert. Bitte kontaktieren Sie den Support.',
            type: 'error',
            title: 'Konto deaktiviert'
        },
        consent_system_error: {
            message: 'Das Zustimmungssystem ist derzeit nicht verfügbar. Bitte versuchen Sie es später erneut.',
            type: 'error',
            title: 'Systemfehler'
        },
        consent_validation_error: {
            message: 'Bei der Überprüfung Ihrer Zustimmung ist ein Fehler aufgetreten. Bitte melden Sie sich erneut an.',
            type: 'error',
            title: 'Validierungsfehler'
        },
        odoo_conflict: {
            message: 'Es besteht ein Konflikt mit Ihrem Odoo-Konto. Bitte kontaktieren Sie den Support.',
            type: 'error',
            title: 'Odoo-Konflikt'
        },
        odoo_login_error: {
            message: 'Die Anmeldung beim Portal ist fehlgeschlagen. Bitte versuchen Sie es erneut.',
            type: 'error',
            title: 'Anmeldefehler'
        },
        error: {message: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.', type: 'error', title: 'Fehler'},
    };

    if (reason && reasonNotifications[reason]) {
        notificationData = reasonNotifications[reason];
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
        if (notificationData.persistent) {
            params.append('persistent', 'true');
        }

        const returnTo = `/welcome?${params.toString()}`;

        return await res.oidc.logout({returnTo: returnTo});
    }

    await res.oidc.logout();
});

// OIDC routes are already handled by the express-openid-connect middleware in the app.js file.

module.exports = auth_controller;