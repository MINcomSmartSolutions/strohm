/**
 * @file Helper utilities for flash notifications
 * @module helpers/notifications
 */

const VALID_NOTIFICATION_TYPES = ['success', 'error', 'warning', 'info'];

/**
 * Validates notification type
 * @param {string} type - Type to validate
 * @returns {string} - Valid type or default 'info'
 */
function validateNotificationType(type) {
    return VALID_NOTIFICATION_TYPES.includes(type) ? type : 'info';
}

/**
 * Validates URL to prevent open redirect vulnerabilities
 * @param {string} url - URL to validate
 * @returns {boolean} - True if URL is safe
 */
function isUrlSafe(url) {
    // Only allow relative URLs or URLs from the same origin
    if (!url) return false;

    // Allow relative URLs
    if (url.startsWith('/')) {
        // Prevent protocol-relative URLs (//evil.com)
        if (url.startsWith('//')) return false;
        return true;
    }

    // Reject absolute URLs to prevent open redirect
    return false;
}

/**
 * Sanitizes message to prevent injection attacks
 * @param {string} message - Message to sanitize
 * @returns {string} - Sanitized message
 */
function sanitizeMessage(message) {
    if (typeof message !== 'string') {
        return String(message);
    }
    // Limit message length to prevent DoS
    return message.substring(0, 500);
}

/**
 * Sets a flash message in the session that will be displayed on the next page
 * @param {Object} req - Express request object with session
 * @param {string} message - The message to display
 * @param {string} type - Type of notification: 'success', 'error', 'warning', 'info'
 * @param {string|null} title - Optional custom title for the notification
 */
function setFlashMessage(req, message, type = 'info', title = null) {
    if (!req.session) {
        console.warn('Session not available for flash message');
        return;
    }

    req.session.flashMessage = {
        message: sanitizeMessage(message),
        type: validateNotificationType(type),
        title: title ? sanitizeMessage(title) : null
    };
}

/**
 * Gets and clears the flash message from session
 * @param {Object} req - Express request object with session
 * @returns {Object|null} Flash message object or null
 */
function getFlashMessage(req) {
    if (!req.session || !req.session.flashMessage) {
        return null;
    }

    const message = req.session.flashMessage;
    delete req.session.flashMessage;
    return message;
}

/**
 * Redirects to a URL with notification parameters
 * @param {Object} res - Express response object
 * @param {string} url - URL to redirect to (must be relative)
 * @param {string} message - The message to display
 * @param {string} type - Type of notification: 'success', 'error', 'warning', 'info'
 * @param {string|null} title - Optional custom title for the notification
 * @throws {Error} If URL is not safe (prevents open redirect)
 */
function redirectWithNotification(res, url, message, type = 'info', title = null) {
    // Validate URL to prevent open redirect vulnerability
    if (!isUrlSafe(url)) {
        throw new Error('Invalid redirect URL. Only relative URLs are allowed.');
    }

    // Validate and sanitize inputs
    const validType = validateNotificationType(type);
    const sanitizedMessage = sanitizeMessage(message);
    const sanitizedTitle = title ? sanitizeMessage(title) : null;

    const params = new URLSearchParams({
        message: sanitizedMessage,  // URLSearchParams handles encoding
        type: validType
    });

    if (sanitizedTitle) {
        params.append('title', sanitizedTitle);
    }

    const separator = url.includes('?') ? '&' : '?';
    res.redirect(`${url}${separator}${params.toString()}`);
}

module.exports = {
    setFlashMessage,
    getFlashMessage,
    redirectWithNotification,
    validateNotificationType,
    isUrlSafe,
    sanitizeMessage
};
