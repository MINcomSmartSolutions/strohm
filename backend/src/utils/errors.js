/**
 * Application Error Codes
 *
 * This module defines standardized error codes and messages for the application.
 * Errors are grouped by category and include codes, HTTP status codes, and messages.
 */
const logger = require('../services/logger');

const ExceptionCodes = Object.freeze({
    // Authentication errors (1000-1099)
    AUTH: Object.freeze({
        KEY_MISSING: {code: 1000, status: 401, message: 'Token not found'},
        KEY_EXPIRED: {code: 1001, status: 401, message: 'Expired token'},
        KEY_INVALID: {code: 1002, status: 401, message: 'Invalid token'},
        KEY_NOT_YET_VALID: {code: 1003, status: 401, message: 'Token is not valid yet'},
        USER_INACTIVE: {code: 1010, status: 200, message: 'Benutzer ist nicht aktiv'},
        USER_INVALID: {code: 1011, status: 200, message: 'ungültiger Benutzer'},
        USER_DELETED: {code: 1012, status: 200, message: 'ungültiger Benutzer'},
        USER_MISMATCH: {code: 1013, status: 401, message: 'ungültiger Benutzer'},
    }),

    // Validation errors (2000-2099)
    VALIDATION: Object.freeze({
        MISSING_REQUIRED_FIELD: {code: 2000, status: 400, message: 'Required field is missing'},
        INVALID_FORMAT: {code: 2001, status: 400, message: 'Invalid data format'},
        INVALID_EMAIL: {code: 2002, status: 400, message: 'Invalid email format'},
        INVALID_PASSWORD: {code: 2003, status: 400, message: 'Invalid password format'},
        //PS: Asked for one return, but received two, NOT asked for one return, but received none
        ASK_RETURN_DISCREPANCY: {code: 2004, status: 400, message: 'Ask return discrepancy'},
        GIVEN_RETURN_DISCREPANCY: {code: 2005, status: 400, message: 'Given return discrepancy'},
        MISSING_PARAMETERS: {code: 2006, status: 400, message: 'Missing parameters'},
        INVALID_PARAMETERS: {code: 2007, status: 400, message: 'Invalid parameters'},
    }),

    // Database errors (3000-3099)
    DATABASE: Object.freeze({
        CONNECTION_ERROR: {code: 3000, status: 500, message: 'Database connection error'},
        QUERY_ERROR: {code: 3001, status: 500, message: 'Database query error'},
        RECORD_NOT_FOUND: {code: 3002, status: 404, message: 'Record not found'},
        DUPLICATE_ENTRY: {code: 3003, status: 409, message: 'Record already exists'},
    }),

    // OAuth errors (4000-4099)
    OAUTH: Object.freeze({
        KEY_INVALID: {code: 4000, status: 401, message: 'Invalid OAuth token'},
        VERIFICATION_FAILED: {code: 4001, status: 401, message: 'OAuth verification failed'},
        SCOPE_INVALID: {code: 4002, status: 403, message: 'Invalid OAuth scope'},
        RFID_NOT_FOUND: {code: 4020, message: 'User\'s RFID is not found on returned data'},
    }),

    // General application errors (5000-5099)
    SYSTEM: Object.freeze({
        UNKNOWN_ERROR: {code: 5000, status: 500, message: 'An unknown error occurred'},
        NOT_IMPLEMENTED: {code: 5001, status: 500, message: 'Feature not implemented'},
        SERVICE_UNAVAILABLE: {code: 5002, status: 500, message: 'Service temporarily unavailable'},
    }),

    // Related to user operation errors in backend (6000-6099)
    USER: Object.freeze({
        NOT_FOUND: {code: 6000, message: 'User not found'},
        ALREADY_EXISTS: {code: 6001, message: 'User already exists'},
        UPDATE_FAILED: {code: 6002, message: 'User update failed'},
        DELETE_FAILED: {code: 6003, message: 'User delete failed'},
        CREATE_FAILED: {code: 6004, message: 'User create failed'},
        ODOO_NOT_FOUND: {code: 6010, message: 'User\'s  Odoo ID is not found'},
        ODOO_PARTNER_ID_NOT_FOUND: {code: 6011, message: 'User\'s Odoo partner ID is not found'},
        ODOO_NO_CREDENTIALS: {code: 6012, message: 'User does not have valid Odoo credentials'},
        ODOO_ID_MISMATCH: {code: 6013, message: 'User Odoo ID mismatch'},
        ODOO_EXISTS: {code: 6014, message: 'User already exists in Odoo'},
        KEY_ROTATION_FAILED: {code: 6015, message: 'User token rotation failed'},
        RFID_NOT_FOUND: {code: 6020, message: 'User\'s RFID is not found'},
    }),

    // Related to Odoo errors (7000-7099)
    ODOO: Object.freeze({
        USER_NOT_FOUND: {code: 7001, message: 'User not found in Odoo'},
        USER_EXISTS: {code: 7000, message: 'User already exists in Odoo'},
        USER_CREATE_FAILED: {code: 7002, message: 'User creation in Odoo failed'},
        USER_UPDATE_FAILED: {code: 7003, message: 'User update in Odoo failed'},
        USER_DELETE_FAILED: {code: 7004, message: 'User deletion in Odoo failed'},
        USER_NOT_AUTHORIZED: {code: 7005, message: 'User is not authorized to perform this action in Odoo'},
        USER_NOT_ACTIVE: {code: 7006, message: 'User is not active in Odoo'},
        KEY_ROTATION_FAILED: {code: 7007, message: 'Token rotation in Odoo failed'},
        HASH_VERIFICATION_FAILED: {code: 7008, message: 'Odoo hash verification failed'},
        BILL_CREATE_FAILED: {code: 7009, message: 'Transaction bill creation in Odoo failed'},
    }),

    EPS: Object.freeze({
        CONNECTION_ERROR: {code: 8001, status: 500, message: 'SOAP could not establish connection with EPS'},
    }),

    STEVE: Object.freeze({
        USER_EXISTS: {code: 9000, status: 500, message: 'User already exists in Steve'},
    }),
});


/**
 * Create an application error with standard format
 *
 * @param {Object} errorDef - Error definition from ExceptionCodes
 * @param {null} [customMessage] - Optional custom message to override default
 * @param {Error} [originalError] - Original error object if applicable
 * @returns {Object} Formatted error object
 */
const createError = (errorDef, customMessage = null, originalError = null) => {
    return {
        success: false,
        code: errorDef.code,
        msg: customMessage || errorDef.message,
        details: originalError ? (originalError.message || String(originalError)) : undefined,
    };
};

/**
 * Base class for custom application errors
 */
class AppError extends Error {
    constructor(errorDef, customMessage = null, originalError = null) {
        super(customMessage || errorDef.message);
        this.name = this.constructor.name;
        this.errorDef = errorDef;
        this.customMessage = customMessage;
        this.originalError = originalError;
        Error.captureStackTrace(this, this.constructor);
    }

    getStatusCode() {
        return this.errorDef.status ?? 500;
    }

    toResponse() {
        return createError(this.errorDef, this.customMessage, this.originalError);
    }
}

// Category-specific error classes
class AuthError extends AppError {
}

class ValidationError extends AppError {
}

class DatabaseError extends AppError {
}

class OAuthError extends AppError {
}

class SystemError extends AppError {
}


/**
 * Express error handler for AppErrors
 */
const appErrorHandler = (err, res) => {

    if (err.stack) {
        logger.error(err.stack);
    }

    if (err instanceof AppError) {
        return res.status(err.getStatusCode()).json(err.toResponse());
    }

    // Handle unexpected errors
    const systemError = new SystemError(ExceptionCodes.SYSTEM.UNKNOWN_ERROR, null, err);
    return res.status(systemError.getStatusCode()).json(systemError.toResponse());
};

module.exports = {
    ErrorCodes: ExceptionCodes,
    createError,
    AppError,
    AuthError,
    ValidationError,
    DatabaseError,
    OAuthError,
    SystemError,
    appErrorHandler,
};