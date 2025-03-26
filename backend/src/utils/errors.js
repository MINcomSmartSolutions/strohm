/**
 * Application Error Codes
 *
 * This module defines standardized error codes and messages for the application.
 * Errors are grouped by category and include codes, HTTP status codes, and messages.
 */

const ExceptionCodes = Object.freeze({
  // Authentication errors (1000-1099)
  AUTH: Object.freeze({
    TOKEN_MISSING: { code: 1000, status: 401, message: 'Token not found' },
    TOKEN_EXPIRED: { code: 1001, status: 401, message: 'Expired token' },
    TOKEN_INVALID: { code: 1002, status: 401, message: 'Invalid token' },
    TOKEN_NOT_YET_VALID: { code: 1003, status: 401, message: 'Token is not valid yet' },
    USER_INACTIVE: { code: 1010, status: 200, message: 'Benutzer ist nicht aktiv' },
    USER_INVALID: { code: 1011, status: 200, message: 'ungültiger Benutzer' },
    USER_DELETED: { code: 1012, status: 200, message: 'ungültiger Benutzer' },
    USER_MISMATCH: { code: 1013, status: 401, message: 'ungültiger Benutzer' }
  }),

  // Validation errors (2000-2099)
  VALIDATION: Object.freeze({
    MISSING_REQUIRED_FIELD: { code: 2000, status: 400, message: 'Required field is missing' },
    INVALID_FORMAT: { code: 2001, status: 400, message: 'Invalid data format' },
    INVALID_EMAIL: { code: 2002, status: 400, message: 'Invalid email format' },
    INVALID_PASSWORD: { code: 2003, status: 400, message: 'Invalid password format' }
  }),

  // Database errors (3000-3099)
  DATABASE: Object.freeze({
    CONNECTION_ERROR: { code: 3000, status: 500, message: 'Database connection error' },
    QUERY_ERROR: { code: 3001, status: 500, message: 'Database query error' },
    RECORD_NOT_FOUND: { code: 3002, status: 404, message: 'Record not found' },
    DUPLICATE_ENTRY: { code: 3003, status: 409, message: 'Record already exists' }
  }),

  // OAuth errors (4000-4099)
  OAUTH: Object.freeze({
    TOKEN_INVALID: { code: 4000, status: 401, message: 'Invalid OAuth token' },
    VERIFICATION_FAILED: { code: 4001, status: 401, message: 'OAuth verification failed' },
    SCOPE_INVALID: { code: 4002, status: 403, message: 'Invalid OAuth scope' }
  }),

  // General application errors (5000-5099)
  SYSTEM: Object.freeze({
    UNKNOWN_ERROR: { code: 5000, status: 500, message: 'An unknown error occurred' },
    NOT_IMPLEMENTED: { code: 5001, status: 501, message: 'Feature not implemented' },
    SERVICE_UNAVAILABLE: { code: 5002, status: 503, message: 'Service temporarily unavailable' }
  })
});

/**
 * Create an application error with standard format
 *
 * @param {Object} errorDef - Error definition from ExceptionCodes
 * @param {string} [customMessage] - Optional custom message to override default
 * @param {Error} [originalError] - Original error object if applicable
 * @returns {Object} Formatted error object
 */
const createError = (errorDef, customMessage = null, originalError = null) => {
  return {
    success: false,
    code: errorDef.code,
    msg: customMessage || errorDef.message,
    details: originalError ? (originalError.message || String(originalError)) : undefined
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
    return this.errorDef.status;
  }

  toResponse() {
    return createError(this.errorDef, this.customMessage, this.originalError);
  }
}

// Category-specific error classes
class AuthError extends AppError {}
class ValidationError extends AppError {}
class DatabaseError extends AppError {}
class OAuthError extends AppError {}
class SystemError extends AppError {}

/**
 * Express error handler for AppErrors
 */
const appErrorHandler = (err, res) => {
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
	appErrorHandler
};