const {
    ErrorCodes,
    createError,
    AppError,
    AuthError,
    ValidationError,
    DatabaseError,
    OAuthError,
    SystemError,
    appErrorHandler,
} = require('#utils/errors');

describe('Error Utilities', () => {
    describe('createError', () => {
        it('should create an error object with the correct structure', () => {
            const errorDef = ErrorCodes.AUTH.KEY_MISSING;
            const error = createError(errorDef);

            expect(error).toEqual({
                success: false,
                code: errorDef.code,
                msg: errorDef.message,
                details: undefined,
            });
        });

        it('should use custom message when provided', () => {
            const errorDef = ErrorCodes.AUTH.KEY_MISSING;
            const customMessage = 'Custom error message';
            const error = createError(errorDef, customMessage);

            expect(error.msg).toBe(customMessage);
        });

        it('should include original error details when provided', () => {
            const errorDef = ErrorCodes.AUTH.KEY_MISSING;
            const originalError = new Error('Original error');
            const error = createError(errorDef, null, originalError);

            expect(error.details).toBe('Original error');
        });
    });

    describe('AppError', () => {
        it('should create an AppError with correct properties', () => {
            const errorDef = ErrorCodes.AUTH.KEY_MISSING;
            const error = new AppError(errorDef);

            expect(error.name).toBe('AppError');
            expect(error.message).toBe(errorDef.message);
            expect(error.errorDef).toBe(errorDef);
        });

        it('should use custom message when provided', () => {
            const errorDef = ErrorCodes.AUTH.KEY_MISSING;
            const customMessage = 'Custom error message';
            const error = new AppError(errorDef, customMessage);

            expect(error.message).toBe(customMessage);
        });

        it('should get correct status code', () => {
            const errorDef = ErrorCodes.AUTH.KEY_MISSING;
            const error = new AppError(errorDef);

            expect(error.getStatusCode()).toBe(errorDef.status);
        });

        it('should default to status code 500 when not defined', () => {
            const errorDefWithoutStatus = {code: 9999, message: 'No status code'};
            const error = new AppError(errorDefWithoutStatus);

            expect(error.getStatusCode()).toBe(500);
        });

        it('should convert to response format', () => {
            const errorDef = ErrorCodes.AUTH.KEY_MISSING;
            const error = new AppError(errorDef);
            const response = error.toResponse();

            expect(response).toEqual({
                success: false,
                code: errorDef.code,
                msg: errorDef.message,
                details: undefined,
            });
        });
    });

    describe('Specialized Error Classes', () => {
        it('should create AuthError correctly', () => {
            const errorDef = ErrorCodes.AUTH.KEY_MISSING;
            const error = new AuthError(errorDef);

            expect(error.name).toBe('AuthError');
            expect(error instanceof AppError).toBe(true);
        });

        it('should create ValidationError correctly', () => {
            const errorDef = ErrorCodes.VALIDATION.MISSING_REQUIRED_FIELD;
            const error = new ValidationError(errorDef);

            expect(error.name).toBe('ValidationError');
            expect(error instanceof AppError).toBe(true);
        });

        it('should create DatabaseError correctly', () => {
            const errorDef = ErrorCodes.DATABASE.CONNECTION_ERROR;
            const error = new DatabaseError(errorDef);

            expect(error.name).toBe('DatabaseError');
            expect(error instanceof AppError).toBe(true);
        });

        it('should create OAuthError correctly', () => {
            const errorDef = ErrorCodes.OAUTH.KEY_INVALID;
            const error = new OAuthError(errorDef);

            expect(error.name).toBe('OAuthError');
            expect(error instanceof AppError).toBe(true);
        });

        it('should create SystemError correctly', () => {
            const errorDef = ErrorCodes.SYSTEM.UNKNOWN_ERROR;
            const error = new SystemError(errorDef);

            expect(error.name).toBe('SystemError');
            expect(error instanceof AppError).toBe(true);
        });
    });

    describe('appErrorHandler', () => {
        it('should handle AppError correctly', () => {
            const errorDef = ErrorCodes.AUTH.KEY_MISSING;
            const error = new AuthError(errorDef);

            const res = {
                redirect: jest.fn(),
            };

            appErrorHandler(error, res);

            const status = error.getStatusCode();
            const resp = error.toResponse();
            const messageWithStatus = `${status} - ${resp.msg}`;

            expect(res.redirect).toHaveBeenCalledWith('/logout?message=' + encodeURIComponent(messageWithStatus) + '&type=error');
        });

        it('should handle unknown errors with SystemError', () => {
            const error = new Error('Unknown error');

            const res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn(),
            };

            appErrorHandler(error, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                code: ErrorCodes.SYSTEM.UNKNOWN_ERROR.code,
            }));
        });
    });
});
