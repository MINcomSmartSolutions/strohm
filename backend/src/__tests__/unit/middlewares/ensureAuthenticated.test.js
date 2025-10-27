/**
 * @file Unit tests for ensureAuthenticated middleware
 *
 * Tests cover:
 * - OIDC authentication validation
 * - User lookup and loading
 * - Session synchronization
 * - Error handling and redirects
 */

const {ensureAuthenticated} = require('#middlewares/ensureAuthenticated');
const {validateOIDCProperties} = require('#helpers/auth');
const {db} = require('#utils/queries');
const {clearSession, saveSession} = require('#utils/session');
const logger = require('#services/logger');
const {SystemError, ErrorCodes} = require("#utils/errors");

// Mock dependencies
jest.mock('#helpers/auth');
jest.mock('#utils/queries');
jest.mock('#utils/session');
jest.mock('#services/logger');

describe('ensureAuthenticated Middleware - Unit Tests', () => {
    let req, res, next;
    let mockLog;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Setup mock logger
        mockLog = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        };
        logger.withSession = jest.fn().mockReturnValue(mockLog);

        // Setup request mock
        req = {
            sessionID: 'test-session-id',
            oidc: {
                isAuthenticated: jest.fn(),
                user: {
                    sub: 'auth0|test-user-123',
                    email: 'test@example.com',
                    name: 'Test User',
                },
            },
            session: {
                user: null,
                save: jest.fn((callback) => callback()),
            },
            appSession: {
                user: {
                    sub: 'auth0|test-user-123',
                    email: 'test@example.com',
                    name: 'Test User',
                    firstName: 'Test',
                    lastName: 'User',
                },
            },
        };

        // Setup response mock
        res = {
            redirect: jest.fn(),
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };

        saveSession: jest.fn();

        // Setup next function
        next = jest.fn();
    });

    describe('Authentication Checks', () => {
        it('should redirect to /welcome if user is not authenticated by OIDC', async () => {
            req.oidc.isAuthenticated.mockReturnValue(false);
            clearSession.mockResolvedValue();

            await ensureAuthenticated(req, res, next);

            expect(req.oidc.isAuthenticated).toHaveBeenCalled();
            expect(clearSession).toHaveBeenCalledWith(req);
            expect(res.redirect).toHaveBeenCalledWith('/welcome');
            expect(next).not.toHaveBeenCalled();
        });

        it('should redirect to /welcome if OIDC validation fails', async () => {
            req.oidc.isAuthenticated.mockReturnValue(true);
            validateOIDCProperties.mockResolvedValue(false);
            clearSession.mockResolvedValue();

            await ensureAuthenticated(req, res, next);

            expect(validateOIDCProperties).toHaveBeenCalledWith(req);
            expect(mockLog.warn).toHaveBeenCalledWith('OIDC validation failed in ensureAuthenticated');
            expect(clearSession).toHaveBeenCalledWith(req);
            expect(res.redirect).toHaveBeenCalledWith('/welcome');
            expect(next).not.toHaveBeenCalled();
        });

        it('should set sessionId on request object', async () => {
            req.oidc.isAuthenticated.mockReturnValue(true);
            validateOIDCProperties.mockResolvedValue(true);
            db.getUserUnique.mockResolvedValue(null);

            await ensureAuthenticated(req, res, next);

            expect(req.sessionId).toBe('test-session-id');
        });

        it('should handle missing sessionID gracefully', async () => {
            delete req.sessionID;
            req.oidc.isAuthenticated.mockReturnValue(true);
            validateOIDCProperties.mockResolvedValue(true);
            db.getUserUnique.mockResolvedValue(null);

            await ensureAuthenticated(req, res, next);

            expect(req.sessionId).toBe('no-session');
        });
    });

    describe('User Lookup', () => {
        it('should load existing user into req.user', async () => {
            const mockUser = {
                user_id: 123,
                oauth_id: 'auth0|test-user-123',
                email: 'test@example.com',
                name: 'Test User',
                rfid: 'RFID123',
                steve_id: 456,
                created_at: new Date(),
                deactivated_at: null,
            };

            req.oidc.isAuthenticated.mockReturnValue(true);
            validateOIDCProperties.mockResolvedValue(true);
            db.getUserUnique.mockResolvedValue(mockUser);

            await ensureAuthenticated(req, res, next);

            expect(db.getUserUnique).toHaveBeenCalledWith({oauth_id: 'auth0|test-user-123'});
            expect(req.user).toEqual(mockUser);
            expect(next).toHaveBeenCalled();
        });

        it('should handle new user (not in database) and allow access to consent route', async () => {
            req.oidc.isAuthenticated.mockReturnValue(true);
            validateOIDCProperties.mockResolvedValue(true);
            db.getUserUnique.mockResolvedValue(null);

            await ensureAuthenticated(req, res, next);

            expect(db.getUserUnique).toHaveBeenCalledWith({oauth_id: 'auth0|test-user-123'});
            expect(req.user).toBeUndefined();
            expect(res.redirect).not.toHaveBeenCalled();
            expect(next).toHaveBeenCalled();
        });
    });

    describe('Session Synchronization', () => {
        it('should synchronize session when session.user is missing', async () => {
            const mockUser = {
                user_id: 123,
                oauth_id: 'auth0|test-user-123',
                email: 'test@example.com',
                name: 'Test User',
            };

            req.oidc.isAuthenticated.mockReturnValue(true);
            validateOIDCProperties.mockResolvedValue(true);
            db.getUserUnique.mockResolvedValue(mockUser);
            req.session.user = null;

            await ensureAuthenticated(req, res, next);

            expect(mockLog.debug).toHaveBeenCalled();
            expect(req.session.user).toEqual(mockUser);
            expect(saveSession).toHaveBeenCalled();
            expect(next).toHaveBeenCalled();
        });

        it('should synchronize session when user_id differs', async () => {
            const mockUser = {
                user_id: 123,
                oauth_id: 'auth0|test-user-123',
                email: 'test@example.com',
                name: 'Test User',
            };

            req.oidc.isAuthenticated.mockReturnValue(true);
            validateOIDCProperties.mockResolvedValue(true);
            db.getUserUnique.mockResolvedValue(mockUser);
            req.session.user = {user_id: 999, oauth_id: 'different-id'};

            await ensureAuthenticated(req, res, next);

            expect(mockLog.debug).toHaveBeenCalledWith('Synchronizing session for user 123');
            expect(req.session.user).toEqual(mockUser);
            expect(saveSession).toHaveBeenCalled();
            expect(next).toHaveBeenCalled();
        });

        it('should NOT synchronize session when session.user matches', async () => {
            const mockUser = {
                user_id: 123,
                oauth_id: 'auth0|test-user-123',
                email: 'test@example.com',
                name: 'Test User',
            };

            req.oidc.isAuthenticated.mockReturnValue(true);
            validateOIDCProperties.mockResolvedValue(true);
            db.getUserUnique.mockResolvedValue(mockUser);
            req.session.user = {user_id: 123, oauth_id: 'auth0|test-user-123'};

            await ensureAuthenticated(req, res, next);

            expect(mockLog.debug).not.toHaveBeenCalledWith(expect.stringContaining('Synchronizing'));
            expect(saveSession).not.toHaveBeenCalled();
            expect(next).toHaveBeenCalled();
        });

        it('should handle session save errors', async () => {
            const mockUser = {
                user_id: 123,
                oauth_id: 'auth0|test-user-123',
                email: 'test@example.com',
                name: 'Test User',
            };

            const sessionError = new SystemError(ErrorCodes.SYSTEM.SESSION_SAVE_FAILED);
            req.oidc.isAuthenticated.mockReturnValue(true);
            validateOIDCProperties.mockResolvedValue(true);
            db.getUserUnique.mockResolvedValue(mockUser);
            req.session.user = null;
            saveSession.mockImplementation((req) => Promise.reject(sessionError));

            await ensureAuthenticated(req, res, next);

            expect(mockLog.error).toHaveBeenCalled();
            expect(res.redirect).toHaveBeenCalledWith('/welcome');
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('Error Handling', () => {
        it('should redirect to /welcome on database errors', async () => {
            const dbError = new Error('Database connection failed');
            req.oidc.isAuthenticated.mockReturnValue(true);
            validateOIDCProperties.mockResolvedValue(true);
            db.getUserUnique.mockRejectedValue(dbError);

            await ensureAuthenticated(req, res, next);

            expect(mockLog.error).toHaveBeenCalledWith(
                'Error in ensureAuthenticated middleware:',
                dbError
            );
            expect(res.redirect).toHaveBeenCalledWith('/welcome');
            expect(next).not.toHaveBeenCalled();
        });

        it('should redirect to /welcome on validateOIDCProperties errors', async () => {
            const validationError = new Error('OIDC validation error');
            req.oidc.isAuthenticated.mockReturnValue(true);
            validateOIDCProperties.mockRejectedValue(validationError);

            await ensureAuthenticated(req, res, next);

            expect(mockLog.error).toHaveBeenCalledWith(
                'Error in ensureAuthenticated middleware:',
                validationError
            );
            expect(res.redirect).toHaveBeenCalledWith('/welcome');
            expect(next).not.toHaveBeenCalled();
        });

        it('should redirect to /welcome on clearSession errors', async () => {
            const clearError = new Error('Clear session error');
            req.oidc.isAuthenticated.mockReturnValue(false);
            clearSession.mockRejectedValue(clearError);

            await ensureAuthenticated(req, res, next);

            expect(mockLog.error).toHaveBeenCalledWith(
                'Error in ensureAuthenticated middleware:',
                clearError
            );
            expect(res.redirect).toHaveBeenCalledWith('/welcome');
            expect(next).not.toHaveBeenCalled();
        });

        it('should handle errors when OIDC object is malformed', async () => {
            req.oidc = null;

            await ensureAuthenticated(req, res, next);

            expect(mockLog.error).toHaveBeenCalled();
            expect(res.redirect).toHaveBeenCalledWith('/welcome');
            expect(next).not.toHaveBeenCalled();
        });
    });

//FIXME: Not deterministic
    describe('Complete Authentication Flow', () => {
        it('should complete full authentication flow for existing user', async () => {
            const mockUser = {
                user_id: 123,
                oauth_id: 'auth0|test-user-123',
                email: 'test@example.com',
                name: 'Test User',
                rfid: 'RFID123',
                steve_id: 456,
            };

            req.oidc.isAuthenticated.mockReturnValue(true);
            validateOIDCProperties.mockResolvedValue(true);
            saveSession.mockResolvedValue();
            db.getUserUnique.mockResolvedValue(mockUser);

            await ensureAuthenticated(req, res, next);

            // Verify the complete flow
            expect(req.oidc.isAuthenticated).toHaveBeenCalled();
            expect(validateOIDCProperties).toHaveBeenCalledWith(req);
            expect(db.getUserUnique).toHaveBeenCalledWith({oauth_id: 'auth0|test-user-123'});
            expect(req.user).toEqual(mockUser);
            expect(req.session.user).toEqual(mockUser);
            expect(res.redirect).not.toHaveBeenCalled();
            expect(next).toHaveBeenCalled();
        });

        it('should complete full flow for new user without blocking', async () => {
            req.oidc.isAuthenticated.mockReturnValue(true);
            validateOIDCProperties.mockResolvedValue(true);
            db.getUserUnique.mockResolvedValue(null);

            await ensureAuthenticated(req, res, next);

            // Verify new user can proceed to consent
            expect(req.oidc.isAuthenticated).toHaveBeenCalled();
            expect(validateOIDCProperties).toHaveBeenCalledWith(req);
            expect(db.getUserUnique).toHaveBeenCalledWith({oauth_id: 'auth0|test-user-123'});
            expect(req.user).toBeUndefined();
            expect(next).toHaveBeenCalled();
            expect(res.redirect).not.toHaveBeenCalled();
        });
    });
});

