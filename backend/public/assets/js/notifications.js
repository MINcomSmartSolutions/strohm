/**
 * Notification System
 * Displays toast-style notifications to users
 * TODO: Needs through review
 * e.g. /welcome?message=Hello&type=success&title=Welcome
 */

class NotificationManager {
    constructor() {
        this.container = null;
        this.validTypes = ['success', 'error', 'warning', 'info'];
        this.init();
    }

    init() {
        // Create container if it doesn't exist
        if (!document.querySelector('.notification-container')) {
            this.container = document.createElement('div');
            this.container.className = 'notification-container';
            document.body.appendChild(this.container);
        } else {
            this.container = document.querySelector('.notification-container');
        }

        // Check for flash messages in URL params
        this.checkURLParams();
    }

    /**
     * Escapes HTML to prevent XSS attacks
     * @param {string} text - Text to escape
     * @returns {string} - Escaped text
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Validates notification type
     * @param {string} type - Type to validate
     * @returns {string} - Valid type or default 'info'
     */
    validateType(type) {
        return this.validTypes.includes(type) ? type : 'info';
    }

    checkURLParams() {
        const params = new URLSearchParams(window.location.search);
        const message = params.get('message');
        const type = params.get('type') || 'info';
        const title = params.get('title');

        if (message) {
            // Decode and validate before showing
            const decodedMessage = decodeURIComponent(message);
            const validType = this.validateType(type);
            const decodedTitle = title ? decodeURIComponent(title) : null;

            this.show(decodedMessage, validType, decodedTitle);

            // Clean URL without page reload
            const url = new URL(window.location);
            url.searchParams.delete('message');
            url.searchParams.delete('type');
            url.searchParams.delete('title');
            window.history.replaceState({}, '', url);
        }
    }

    show(message, type = 'info', title = null, duration = 5000) {
        // Validate type
        type = this.validateType(type);

        const notification = this.createNotification(message, type, title);
        this.container.appendChild(notification);

        // Auto-dismiss after duration
        if (duration > 0) {
            setTimeout(() => {
                this.dismiss(notification);
            }, duration);
        }

        return notification;
    }

    createNotification(message, type, title) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;

        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'i'
        };

        const defaultTitles = {
            success: 'Erfolg',
            error: 'Fehler',
            warning: 'Warnung',
            info: 'Information'
        };

        // Escape HTML to prevent XSS
        const escapedMessage = this.escapeHtml(message);
        const escapedTitle = this.escapeHtml(title || defaultTitles[type]);

        notification.innerHTML = `
            <div class="notification-icon">${icons[type] || icons.info}</div>
            <div class="notification-content">
                <div class="notification-title">${escapedTitle}</div>
                <div class="notification-message">${escapedMessage}</div>
            </div>
            <button class="notification-close" aria-label="Close">&times;</button>
        `;

        // Add close button functionality
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => {
            this.dismiss(notification);
        });

        return notification;
    }

    dismiss(notification) {
        notification.classList.add('hiding');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }

    success(message, title = null, duration = 5000) {
        return this.show(message, 'success', title, duration);
    }

    error(message, title = null, duration = 7000) {
        return this.show(message, 'error', title, duration);
    }

    warning(message, title = null, duration = 6000) {
        return this.show(message, 'warning', title, duration);
    }

    info(message, title = null, duration = 5000) {
        return this.show(message, 'info', title, duration);
    }

    clearAll() {
        this.container.innerHTML = '';
    }
}

// Initialize notification manager
const notifications = new NotificationManager();

// Make it globally available
window.notifications = notifications;
