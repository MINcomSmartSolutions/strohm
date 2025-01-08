/**
 * Middleware function to handle errors in the application.
 * @param {Error} err - The error object.
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} - A JSON object with the error message and a 500 status code.
 */
const logger = require('../utils/logger');

// const Sentry = require('@sentry/node');


/**
 * Handles and logs errors, and returns an appropriate response.
 *
 * @param {Error} err - The error object to be handled.
 * @param {Object} res - The response object to return the error response.
 * @return {Object} The error response with appropriate status code and message.
 */
function error_handler(err, res) {
    // Log the error stack
    logger.error('Error happened: ' + err.message);

    if (err.stack) {
        logger.error(err.stack);
        logger.error(err.code);
    }

    // Sentry.captureException(err);

    const EXPOSABLE_ERRORS = ['ENOENT', 'backend'];

    const errorString = err.toString();

    // If error is exposing the filesystem, don't expose the error message, just send a generic error message
    if (EXPOSABLE_ERRORS.some((error) => errorString.includes(error))) {
        return res.status(500).json({success: false, msg: {message: 'Something went wrong.'}});
    } else {
        return res.status(500).json({success: false, msg: {message: err.message || 'Something went wrong.'}});
    }
}


module.exports = error_handler;