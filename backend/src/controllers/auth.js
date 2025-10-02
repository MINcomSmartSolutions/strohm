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
    req.session.destroy((err) => {
        if (err) {
            logger.error('Error destroying session:', err);
        }
    });

    await res.oidc.logout({returnTo: '/welcome'});
});

// OIDC routes are already handled by the express-openid-connect middleware in the app.js file.

module.exports = auth_controller;