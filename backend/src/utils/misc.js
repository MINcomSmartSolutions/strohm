function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Return a safe error message for the client (never expose internal details)
 */
function safeErrorMessage(error, fallback) {
    if (error.code.toString().startsWith("5")) return error.message; // Our own known errors
    return fallback;
}

module.exports = {escapeHtml, safeErrorMessage};