/**
 * @file Unit tests for user operations service
 */
const {userOperations} = require('#services/user_operations');
const {createOdooUser} = require('#services/odoo');
const {db} = require('#utils/queries');
const {createSteveUser, blockSteveUser} = require('#services/steve_user');
const logger = require('#services/logger');
const {AuthError, ValidationError, SystemError, ErrorCodes} = require('#utils/errors');
const {validateUser, oidcUserSchema} = require('#utils/joi');
const {hasStudentAffiliation} = require("#helpers/auth");

// Mock dependencies
jest.mock('#services/odoo', () => ({
    createOdooUser: jest.fn(),
}));

jest.mock('#utils/queries', () => ({
    db: {
        getUserUnique: jest.fn(),
        createUser: jest.fn(),
        updateUser: jest.fn(),
    },
}));

jest.mock('#services/steve_user', () => ({
    createSteveUser: jest.fn(),
    blockSteveUser: jest.fn(),
}));

jest.mock('#services/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(),
    debug: jest.fn(),
}));

jest.mock('#utils/joi', () => ({
    validateUser: jest.fn(),
    oidcUserSchema: jest.requireActual('#utils/joi').oidcUserSchema,
}));

jest.mock('#config', () => ({
    GLOBAL_CONFIG: {
        ENV: {
            IS_PRODUCTION: false,
            IS_DEVELOPMENT: true,
            IS_TEST: false,
        },
        OIDC: {
            DISCOVERY_CACHE_TTL: 24 * 60 * 60 * 1000,
        }
    },
}));

jest.mock('#helpers/auth', () => ({
    hasStudentAffiliation: jest.fn(),
}));

describe('User Operations Service', () => {
    // Common test data
    const mockOidcUser = {
        sub: 'oauth_123',
        name: 'Test User',
        email: 'test@example.com',
    };

    const mockOidcUserMinimal = {
        sub: 'oauth_minimal',
        name: 'Minimal User',
        email: 'minimal@example.com',
    };

    const mockDbUser = {
        user_id: 123,
        oauth_id: 'oauth_123',
        name: 'Test User',
        email: 'test@example.com',
        rfid: 'random123',
        steve_id: null,
        odoo_user_id: null,
        odoo_partner_id: null,
        deactivated_at: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
    };

    const mockFullyQualifiedUser = {
        user_id: 123,
        oauth_id: 'oauth_123',
        name: 'Test User',
        email: 'test@example.com',
        rfid: 'random123',
        steve_id: 999,
        odoo_user_id: 789,
        odoo_partner_id: 456,
        deactivated_at: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
    };

    const mockDeactivatedUser = {
        ...mockFullyQualifiedUser,
        deactivated_at: '2025-01-15T00:00:00Z',
    };

    hasStudentAffiliation.mockReturnValue(false);

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset Math.random for consistent testing
        jest.spyOn(Math, 'random').mockReturnValue(0.123456789);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('userOperations - New User Creation', () => {
        it('should create a new user when user does not exist', async () => {
            // Mock user doesn't exist
            db.getUserUnique.mockResolvedValueOnce(null);

            // Mock user creation
            const createdUser = {
                ...mockDbUser,
                rfid: '3oiyepgo', // Result of Math.random().toString(36).substring(2, 10) with mocked value
            };
            db.createUser.mockResolvedValue(createdUser);

            // Mock external systems creation
            createOdooUser.mockResolvedValue(undefined);
            createSteveUser.mockResolvedValue(undefined);

            // Mock final user retrieval with all IDs
            db.getUserUnique.mockResolvedValueOnce(mockFullyQualifiedUser);

            // Mock validation
            validateUser.mockReturnValue(undefined);

            const result = await userOperations(mockOidcUser);

            // Verify user was created
            expect(db.createUser).toHaveBeenCalledWith(
                mockOidcUser.sub,
                mockOidcUser.name,
                mockOidcUser.email,
                expect.any(String), // RFID is randomly generated
            );

            // Verify logger was called
            expect(logger.debug).toHaveBeenCalledWith(
                expect.stringContaining('User is created in DB')
            );

            // Verify external systems were called
            expect(createOdooUser).toHaveBeenCalledWith(createdUser);
            expect(createSteveUser).toHaveBeenCalledWith(createdUser);

            // Verify user was fetched again
            expect(db.getUserUnique).toHaveBeenCalledTimes(2);

            // Verify validation was called
            expect(validateUser).toHaveBeenCalledWith(mockFullyQualifiedUser);

            expect(result).toEqual(mockFullyQualifiedUser);
        });

        it('should generate random RFID using Math.random', async () => {
            db.getUserUnique.mockResolvedValueOnce(null);

            // Mock different random values
            jest.spyOn(Math, 'random').mockReturnValue(0.999999999);
            const expectedRfid = Math.random().toString(36).substring(2, 10);

            const createdUser = {
                ...mockDbUser,
                rfid: expectedRfid,
            };
            db.createUser.mockResolvedValue(createdUser);

            createOdooUser.mockResolvedValue(undefined);
            createSteveUser.mockResolvedValue(undefined);
            db.getUserUnique.mockResolvedValueOnce(mockFullyQualifiedUser);
            validateUser.mockReturnValue(undefined);

            await userOperations(mockOidcUser);

            expect(db.createUser).toHaveBeenCalledWith(
                mockOidcUser.sub,
                mockOidcUser.name,
                mockOidcUser.email,
                expect.any(String),
            );
        });

        it('should create user with all OIDC user properties', async () => {
            const oidcUserWithAllFields = {
                sub: 'oauth_full',
                name: 'Full Name Test',
                email: 'fulltest@example.com',
            };

            db.getUserUnique.mockResolvedValueOnce(null);

            const createdUser = {
                user_id: 456,
                oauth_id: oidcUserWithAllFields.sub,
                name: oidcUserWithAllFields.name,
                email: oidcUserWithAllFields.email,
                rfid: '3oiyepgo',
                steve_id: null,
                odoo_user_id: null,
                odoo_partner_id: null,
                deactivated_at: null,
                created_at: '2025-01-01T00:00:00Z',
                updated_at: '2025-01-01T00:00:00Z',
            };
            db.createUser.mockResolvedValue(createdUser);

            createOdooUser.mockResolvedValue(undefined);
            createSteveUser.mockResolvedValue(undefined);
            db.getUserUnique.mockResolvedValueOnce({...mockFullyQualifiedUser, ...createdUser});
            validateUser.mockReturnValue(undefined);

            await userOperations(oidcUserWithAllFields);

            expect(db.createUser).toHaveBeenCalledWith(
                oidcUserWithAllFields.sub,
                oidcUserWithAllFields.name,
                oidcUserWithAllFields.email,
                expect.any(String),
            );
        });

        it('should handle user creation when external systems are called in sequence', async () => {
            db.getUserUnique.mockResolvedValueOnce(null);

            const createdUser = {...mockDbUser};
            db.createUser.mockResolvedValue(createdUser);

            let odooCallOrder = 0;
            let steveCallOrder = 0;
            let callCounter = 0;

            createOdooUser.mockImplementation(() => {
                odooCallOrder = ++callCounter;
                return Promise.resolve();
            });

            createSteveUser.mockImplementation(() => {
                steveCallOrder = ++callCounter;
                return Promise.resolve();
            });

            db.getUserUnique.mockResolvedValueOnce(mockFullyQualifiedUser);
            validateUser.mockReturnValue(undefined);

            await userOperations(mockOidcUser);

            // Verify both were called
            expect(createOdooUser).toHaveBeenCalled();
            expect(createSteveUser).toHaveBeenCalled();

            // Odoo should be called before Steve
            expect(odooCallOrder).toBeLessThan(steveCallOrder);
        });
    });

    describe('userOperations - Existing User', () => {
        it('should return existing user with all external system IDs', async () => {
            // User already exists with all IDs
            db.getUserUnique
                .mockResolvedValueOnce(mockFullyQualifiedUser)
                .mockResolvedValueOnce(mockFullyQualifiedUser);

            validateUser.mockReturnValue(undefined);

            const result = await userOperations(mockOidcUser);

            // Should not create new user
            expect(db.createUser).not.toHaveBeenCalled();

            // Should not call external systems (user already has IDs)
            expect(createOdooUser).not.toHaveBeenCalled();
            expect(createSteveUser).not.toHaveBeenCalled();

            // Should validate user
            expect(validateUser).toHaveBeenCalledWith(mockFullyQualifiedUser);

            expect(result).toEqual(mockFullyQualifiedUser);
        });

        it('should create missing Odoo user for existing user', async () => {
            const userWithoutOdoo = {
                ...mockFullyQualifiedUser,
                odoo_user_id: null,
                odoo_partner_id: null,
            };

            db.getUserUnique
                .mockResolvedValueOnce(userWithoutOdoo)
                .mockResolvedValueOnce(mockFullyQualifiedUser);

            createOdooUser.mockResolvedValue(undefined);
            validateUser.mockReturnValue(undefined);

            const result = await userOperations(mockOidcUser);

            // Should create Odoo user
            expect(createOdooUser).toHaveBeenCalledWith(userWithoutOdoo);

            // Should not create Steve user (already has steve_id)
            expect(createSteveUser).not.toHaveBeenCalled();

            // Should not create new user
            expect(db.createUser).not.toHaveBeenCalled();

            expect(result).toEqual(mockFullyQualifiedUser);
        });

        it('should create missing Steve user for existing user', async () => {
            const userWithoutSteve = {
                ...mockFullyQualifiedUser,
                steve_id: null,
            };

            db.getUserUnique
                .mockResolvedValueOnce(userWithoutSteve)
                .mockResolvedValueOnce(mockFullyQualifiedUser);

            createSteveUser.mockResolvedValue(undefined);
            validateUser.mockReturnValue(undefined);

            const result = await userOperations(mockOidcUser);

            // Should create Steve user
            expect(createSteveUser).toHaveBeenCalledWith(userWithoutSteve);

            // Should not create Odoo user (already has odoo_user_id)
            expect(createOdooUser).not.toHaveBeenCalled();

            expect(result).toEqual(mockFullyQualifiedUser);
        });

        it('should create both Odoo and Steve users if both missing', async () => {
            const userWithoutExternalIds = {
                ...mockFullyQualifiedUser,
                odoo_user_id: null,
                odoo_partner_id: null,
                steve_id: null,
            };

            db.getUserUnique
                .mockResolvedValueOnce(userWithoutExternalIds)
                .mockResolvedValueOnce(mockFullyQualifiedUser);

            createOdooUser.mockResolvedValue(undefined);
            createSteveUser.mockResolvedValue(undefined);
            validateUser.mockReturnValue(undefined);

            const result = await userOperations(mockOidcUser);

            // Should create both
            expect(createOdooUser).toHaveBeenCalledWith(userWithoutExternalIds);
            expect(createSteveUser).toHaveBeenCalledWith(userWithoutExternalIds);

            expect(result).toEqual(mockFullyQualifiedUser);
        });

        it('should handle existing user with only odoo_user_id but no odoo_partner_id', async () => {
            const userWithPartialOdoo = {
                ...mockFullyQualifiedUser,
                odoo_user_id: 789,
                odoo_partner_id: null,
                steve_id: null,
            };

            db.getUserUnique
                .mockResolvedValueOnce(userWithPartialOdoo)
                .mockResolvedValueOnce(mockFullyQualifiedUser);

            createOdooUser.mockResolvedValue(undefined);
            createSteveUser.mockResolvedValue(undefined);
            validateUser.mockReturnValue(undefined);

            await userOperations(mockOidcUser);

            // Should still attempt to create both (since odoo_user_id exists but might need update)
            expect(createSteveUser).toHaveBeenCalledWith(userWithPartialOdoo);
        });

        it('should re-fetch user data after external system creation', async () => {
            const userBeforeUpdate = {
                ...mockFullyQualifiedUser,
                steve_id: null,
            };

            const userAfterUpdate = {
                ...mockFullyQualifiedUser,
                steve_id: 999,
                updated_at: '2025-01-02T00:00:00Z',
            };

            db.getUserUnique
                .mockResolvedValueOnce(userBeforeUpdate)
                .mockResolvedValueOnce(userAfterUpdate);

            createSteveUser.mockResolvedValue(undefined);
            validateUser.mockReturnValue(undefined);

            const result = await userOperations(mockOidcUser);

            // Should return the updated user data
            expect(result).toEqual(userAfterUpdate);
            expect(result.steve_id).toBe(999);
        });
    });

    describe('userOperations - Deactivated User', () => {
        it('should throw AuthError when user is deactivated', async () => {
            db.getUserUnique.mockResolvedValue(mockDeactivatedUser);

            await expect(userOperations(mockOidcUser)).rejects.toThrow(AuthError);

            // Verify the error code
            try {
                await userOperations(mockOidcUser);
            } catch (err) {
                expect(err.errorDef.code).toBe(ErrorCodes.AUTH.USER_INACTIVE.code);
            }

            // Should not proceed to create external system users
            expect(createOdooUser).not.toHaveBeenCalled();
            expect(createSteveUser).not.toHaveBeenCalled();
            expect(validateUser).not.toHaveBeenCalled();
        });

        it('should check deactivation status before checking external systems', async () => {
            const deactivatedUserWithoutExternalIds = {
                ...mockDbUser,
                deactivated_at: '2025-01-15T00:00:00Z',
                odoo_user_id: null,
                steve_id: null,
            };

            db.getUserUnique.mockResolvedValue(deactivatedUserWithoutExternalIds);

            await expect(userOperations(mockOidcUser)).rejects.toThrow(AuthError);

            // Should not attempt to create external system users for deactivated user
            expect(createOdooUser).not.toHaveBeenCalled();
            expect(createSteveUser).not.toHaveBeenCalled();
        });

        it('should handle deactivation timestamp in various formats', async () => {
            const userWithTimestamp = {
                ...mockFullyQualifiedUser,
                deactivated_at: '2025-10-15T12:30:45.123Z',
            };

            db.getUserUnique.mockResolvedValue(userWithTimestamp);

            await expect(userOperations(mockOidcUser)).rejects.toThrow(AuthError);
        });
    });

    describe('userOperations - Validation', () => {
        it('should throw error when user validation fails', async () => {
            const invalidUser = {
                ...mockFullyQualifiedUser,
                rfid: null, // Invalid
            };

            db.getUserUnique
                .mockResolvedValueOnce(invalidUser)
                .mockResolvedValueOnce(invalidUser);

            const validationError = new ValidationError(
                ErrorCodes.VALIDATION.INVALID_FORMAT,
                'Invalid user: rfid is required'
            );
            validateUser.mockImplementation(() => {
                throw validationError;
            });

            await expect(userOperations(mockOidcUser)).rejects.toThrow(validationError);

            // Validation should have been called
            expect(validateUser).toHaveBeenCalledWith(invalidUser);
        });

        it('should validate user after external systems are created', async () => {
            db.getUserUnique
                .mockResolvedValueOnce(mockFullyQualifiedUser)
                .mockResolvedValueOnce(mockFullyQualifiedUser);

            validateUser.mockReturnValue(undefined);

            await userOperations(mockOidcUser);

            // Validation should be the last step before returning
            expect(validateUser).toHaveBeenCalledWith(mockFullyQualifiedUser);
            expect(validateUser).toHaveBeenCalledTimes(1);
        });

        it('should validate final user state, not intermediate state', async () => {
            const userWithoutExternalIds = {
                ...mockFullyQualifiedUser,
                odoo_user_id: null,
                steve_id: null,
            };

            db.getUserUnique
                .mockResolvedValueOnce(userWithoutExternalIds)
                .mockResolvedValueOnce(mockFullyQualifiedUser);

            createOdooUser.mockResolvedValue(undefined);
            createSteveUser.mockResolvedValue(undefined);
            validateUser.mockReturnValue(undefined);

            await userOperations(mockOidcUser);

            // Should validate the fully updated user, not the intermediate one
            expect(validateUser).toHaveBeenCalledWith(mockFullyQualifiedUser);
            expect(validateUser).not.toHaveBeenCalledWith(userWithoutExternalIds);
        });

        it('should throw validation error with proper error code', async () => {
            db.getUserUnique.mockResolvedValue(mockFullyQualifiedUser);

            const validationError = new ValidationError(
                ErrorCodes.VALIDATION.INVALID_PARAMETERS,
                'User validation failed'
            );
            validateUser.mockImplementation(() => {
                throw validationError;
            });

            await expect(userOperations(mockOidcUser)).rejects.toThrow(ValidationError);

            // Verify error code in a separate try-catch
            try {
                await userOperations(mockOidcUser);
            } catch (err) {
                expect(err.errorDef.code).toBe(ErrorCodes.VALIDATION.INVALID_PARAMETERS.code);
            }
        });
    });

    describe('userOperations - Error Handling', () => {
        it('should propagate error when user creation fails', async () => {
            db.getUserUnique.mockResolvedValueOnce(null);

            const dbError = new Error('Database error');
            db.createUser.mockRejectedValue(dbError);

            await expect(userOperations(mockOidcUser)).rejects.toThrow(dbError);

            // Should not proceed to external systems
            expect(createOdooUser).not.toHaveBeenCalled();
            expect(createSteveUser).not.toHaveBeenCalled();
        });

        it('should propagate error when Odoo user creation fails', async () => {
            const userWithoutOdoo = {
                ...mockFullyQualifiedUser,
                odoo_user_id: null,
            };

            db.getUserUnique.mockResolvedValueOnce(userWithoutOdoo);

            const odooError = new SystemError(
                ErrorCodes.SYSTEM.SERVICE_UNAVAILABLE,
                'Odoo service unavailable'
            );
            createOdooUser.mockRejectedValue(odooError);

            await expect(userOperations(mockOidcUser)).rejects.toThrow(odooError);

            expect(createOdooUser).toHaveBeenCalledWith(userWithoutOdoo);
        });

        it('should propagate error when Steve user creation fails', async () => {
            const userWithoutSteve = {
                ...mockFullyQualifiedUser,
                steve_id: null,
            };

            db.getUserUnique.mockResolvedValueOnce(userWithoutSteve);

            const steveError = new SystemError(
                ErrorCodes.SYSTEM.SERVICE_UNAVAILABLE,
                'Steve service unavailable'
            );
            createSteveUser.mockRejectedValue(steveError);

            await expect(userOperations(mockOidcUser)).rejects.toThrow(steveError);

            expect(createSteveUser).toHaveBeenCalledWith(userWithoutSteve);
        });

        it('should propagate error when fetching user after creation fails', async () => {
            db.getUserUnique.mockResolvedValueOnce(null);

            const createdUser = {...mockDbUser};
            db.createUser.mockResolvedValue(createdUser);

            createOdooUser.mockResolvedValue(undefined);
            createSteveUser.mockResolvedValue(undefined);

            const fetchError = new Error('Failed to fetch user');
            db.getUserUnique.mockRejectedValueOnce(fetchError);

            await expect(userOperations(mockOidcUser)).rejects.toThrow(fetchError);
        });

        it('should handle when both Odoo and Steve creation fail', async () => {
            const userWithoutExternalIds = {
                ...mockFullyQualifiedUser,
                odoo_user_id: null,
                steve_id: null,
            };

            db.getUserUnique.mockResolvedValueOnce(userWithoutExternalIds);

            const odooError = new Error('Odoo failed');
            createOdooUser.mockRejectedValue(odooError);

            // The first error (Odoo) should be thrown, Steve won't be called
            await expect(userOperations(mockOidcUser)).rejects.toThrow(odooError);

            expect(createOdooUser).toHaveBeenCalled();
        });

        it('should handle database connection timeout on initial user lookup', async () => {
            const timeoutError = new Error('Connection timeout');
            db.getUserUnique.mockRejectedValueOnce(timeoutError);

            await expect(userOperations(mockOidcUser)).rejects.toThrow(timeoutError);

            // Should not attempt to create user
            expect(db.createUser).not.toHaveBeenCalled();
        });
    });

    describe('userOperations - Database Operations', () => {
        it('should fetch user twice for new user creation flow', async () => {
            db.getUserUnique.mockResolvedValueOnce(null);

            db.createUser.mockResolvedValue(mockDbUser);
            createOdooUser.mockResolvedValue(undefined);
            createSteveUser.mockResolvedValue(undefined);

            db.getUserUnique.mockResolvedValueOnce(mockFullyQualifiedUser);
            validateUser.mockReturnValue(undefined);

            await userOperations(mockOidcUser);

            // First call: check if user exists
            // Second call: fetch updated user after external system creation
            expect(db.getUserUnique).toHaveBeenCalledTimes(2);
            expect(db.getUserUnique).toHaveBeenNthCalledWith(1, {oauth_id: mockOidcUser.sub});
            expect(db.getUserUnique).toHaveBeenNthCalledWith(2, {oauth_id: mockOidcUser.sub});
        });

        it('should fetch user twice for existing user flow', async () => {
            db.getUserUnique
                .mockResolvedValueOnce(mockFullyQualifiedUser)
                .mockResolvedValueOnce(mockFullyQualifiedUser);

            validateUser.mockReturnValue(undefined);

            await userOperations(mockOidcUser);

            // First call: check if user exists
            // Second call: fetch potentially updated user after checking external systems
            expect(db.getUserUnique).toHaveBeenCalledTimes(2);
        });

        // it('should query user by oauth_id from OIDC sub', async () => {
        //     const customOidcUser = {
        //         sub: 'custom_oauth_id_12345',
        //         name: 'Custom User',
        //         email: 'custom@example.com',
        //     };
        //
        //     db.getUserUnique
        //         .mockResolvedValueOnce(mockFullyQualifiedUser)
        //         .mockResolvedValueOnce(mockFullyQualifiedUser);
        //     validateUser.mockReturnValue(undefined);
        //
        //     await userOperations(customOidcUser);
        //
        //     expect(db.getUserUnique).toHaveBeenCalledWith({oauth_id: 'custom_oauth_id_12345'});
        // });
    });

    describe('userOperations - Logging', () => {
        it('should log user creation with correct details', async () => {
            db.getUserUnique.mockResolvedValueOnce(null);

            const createdUser = {
                ...mockDbUser,
                email: 'newuser@example.com',
                oauth_id: 'oauth_new_123',
                rfid: 'abc12345',
            };
            db.createUser.mockResolvedValue(createdUser);

            createOdooUser.mockResolvedValue(undefined);
            createSteveUser.mockResolvedValue(undefined);
            db.getUserUnique.mockResolvedValueOnce(mockFullyQualifiedUser);
            validateUser.mockReturnValue(undefined);

            await userOperations(mockOidcUser);

            expect(logger.debug).toHaveBeenCalledWith(
                expect.stringContaining('newuser@example.com')
            );
            expect(logger.debug).toHaveBeenCalledWith(
                expect.stringContaining('oauth_new_123')
            );
            expect(logger.debug).toHaveBeenCalledWith(
                expect.stringContaining('abc12345')
            );
        });

        it('should not log when user already exists', async () => {
            db.getUserUnique
                .mockResolvedValueOnce(mockFullyQualifiedUser)
                .mockResolvedValueOnce(mockFullyQualifiedUser);
            validateUser.mockReturnValue(undefined);

            await userOperations(mockOidcUser);

            // Debug log should not contain user creation message
            expect(logger.debug).not.toHaveBeenCalledWith(
                expect.stringContaining('User is created in DB')
            );
        });
    });

    describe('userOperations - External System Integration', () => {
        it('should call createOdooUser before createSteveUser', async () => {
            const userWithoutExternalIds = {
                ...mockFullyQualifiedUser,
                odoo_user_id: null,
                steve_id: null,
            };

            db.getUserUnique
                .mockResolvedValueOnce(userWithoutExternalIds)
                .mockResolvedValueOnce(mockFullyQualifiedUser);

            const callOrder = [];
            createOdooUser.mockImplementation(() => {
                callOrder.push('odoo');
                return Promise.resolve();
            });
            createSteveUser.mockImplementation(() => {
                callOrder.push('steve');
                return Promise.resolve();
            });
            validateUser.mockReturnValue(undefined);

            await userOperations(mockOidcUser);

            expect(callOrder).toEqual(['odoo', 'steve']);
        });

        it('should not call Steve if Odoo creation fails', async () => {
            const userWithoutExternalIds = {
                ...mockFullyQualifiedUser,
                odoo_user_id: null,
                steve_id: null,
            };

            db.getUserUnique.mockResolvedValueOnce(userWithoutExternalIds);

            const odooError = new Error('Odoo creation failed');
            createOdooUser.mockRejectedValue(odooError);

            await expect(userOperations(mockOidcUser)).rejects.toThrow(odooError);

            // Steve should not be called since Odoo failed
            expect(createSteveUser).not.toHaveBeenCalled();
        });

        it('should pass correct user object to external system creators', async () => {
            const specificUser = {
                user_id: 999,
                oauth_id: 'oauth_specific',
                name: 'Specific User',
                email: 'specific@example.com',
                rfid: 'specific_rfid',
                steve_id: null,
                odoo_user_id: null,
                odoo_partner_id: null,
                deactivated_at: null,
                created_at: '2025-01-01T00:00:00Z',
                updated_at: '2025-01-01T00:00:00Z',
            };

            db.getUserUnique
                .mockResolvedValueOnce(specificUser)
                .mockResolvedValueOnce(mockFullyQualifiedUser);

            createOdooUser.mockResolvedValue(undefined);
            createSteveUser.mockResolvedValue(undefined);
            validateUser.mockReturnValue(undefined);

            await userOperations({sub: 'oauth_specific', name: 'Specific User', email: 'specific@example.com'});

            expect(createOdooUser).toHaveBeenCalledWith(specificUser);
            expect(createSteveUser).toHaveBeenCalledWith(specificUser);
        });
    });

    describe('userOperations - Return Value', () => {
        it('should return fully qualified user object', async () => {
            db.getUserUnique
                .mockResolvedValueOnce(mockFullyQualifiedUser)
                .mockResolvedValueOnce(mockFullyQualifiedUser);
            validateUser.mockReturnValue(undefined);

            const result = await userOperations(mockOidcUser);

            expect(result).toHaveProperty('user_id');
            expect(result).toHaveProperty('oauth_id');
            expect(result).toHaveProperty('name');
            expect(result).toHaveProperty('email');
            expect(result).toHaveProperty('rfid');
            expect(result).toHaveProperty('steve_id');
            expect(result).toHaveProperty('odoo_user_id');
            expect(result).toHaveProperty('odoo_partner_id');
            expect(result).toHaveProperty('deactivated_at');
            expect(result).toHaveProperty('created_at');
            expect(result).toHaveProperty('updated_at');
        });

        it('should return user with correct values', async () => {
            db.getUserUnique
                .mockResolvedValueOnce(mockFullyQualifiedUser)
                .mockResolvedValueOnce(mockFullyQualifiedUser);
            validateUser.mockReturnValue(undefined);

            const result = await userOperations(mockOidcUser);

            expect(result.user_id).toBe(123);
            expect(result.oauth_id).toBe('oauth_123');
            expect(result.steve_id).toBe(999);
            expect(result.odoo_user_id).toBe(789);
            expect(result.odoo_partner_id).toBe(456);
        });

        it('should return refreshed user data after external system creation', async () => {
            const userBefore = {
                ...mockFullyQualifiedUser,
                steve_id: null,
                updated_at: '2025-01-01T00:00:00Z',
            };

            const userAfter = {
                ...mockFullyQualifiedUser,
                steve_id: 999,
                updated_at: '2025-01-02T12:00:00Z',
            };

            db.getUserUnique
                .mockResolvedValueOnce(userBefore)
                .mockResolvedValueOnce(userAfter);

            createSteveUser.mockResolvedValue(undefined);
            validateUser.mockReturnValue(undefined);

            const result = await userOperations(mockOidcUser);

            // Should return the refreshed data
            expect(result.steve_id).toBe(999);
            expect(result.updated_at).toBe('2025-01-02T12:00:00Z');
        });
    });

    // describe('userOperations - OIDC User Input Variations', () => {
    //     it('should handle OIDC user with minimal required fields', async () => {
    //         const minimalOidcUser = {
    //             sub: 'oauth_minimal',
    //             name: 'Minimal',
    //             email: 'minimal@test.com',
    //         };
    //
    //         db.getUserUnique
    //             .mockResolvedValueOnce(mockFullyQualifiedUser)
    //             .mockResolvedValueOnce(mockFullyQualifiedUser);
    //         validateUser.mockReturnValue(undefined);
    //
    //         const result = await userOperations(minimalOidcUser);
    //
    //         expect(result).toBeDefined();
    //         expect(db.getUserUnique).toHaveBeenCalledWith({oauth_id: 'oauth_minimal'});
    //     });
    //
    //     it('should handle OIDC user with special characters in name', async () => {
    //         const oidcUserSpecialChars = {
    //             sub: 'oauth_special',
    //             name: "O'Brien-Smith Jr.",
    //             email: 'obrien@test.com',
    //         };
    //
    //         db.getUserUnique.mockResolvedValueOnce(null);
    //
    //         const createdUser = {
    //             ...mockDbUser,
    //             name: "O'Brien-Smith Jr.",
    //             oauth_id: 'oauth_special',
    //         };
    //         db.createUser.mockResolvedValue(createdUser);
    //
    //         createOdooUser.mockResolvedValue(undefined);
    //         createSteveUser.mockResolvedValue(undefined);
    //         db.getUserUnique.mockResolvedValueOnce(mockFullyQualifiedUser);
    //         validateUser.mockReturnValue(undefined);
    //
    //         await userOperations(oidcUserSpecialChars);
    //
    //         expect(db.createUser).toHaveBeenCalledWith(
    //             'oauth_special',
    //             "O'Brien-Smith Jr.",
    //             'obrien@test.com',
    //             expect.any(String)
    //         );
    //     });
    //
    //     it('should handle OIDC user with email containing plus sign', async () => {
    //         const oidcUserPlusEmail = {
    //             sub: 'oauth_plus',
    //             name: 'Plus User',
    //             email: 'user+test@example.com',
    //         };
    //
    //         db.getUserUnique.mockResolvedValueOnce(null);
    //
    //         const createdUser = {
    //             ...mockDbUser,
    //             email: 'user+test@example.com',
    //         };
    //         db.createUser.mockResolvedValue(createdUser);
    //
    //         createOdooUser.mockResolvedValue(undefined);
    //         createSteveUser.mockResolvedValue(undefined);
    //         db.getUserUnique.mockResolvedValueOnce(mockFullyQualifiedUser);
    //         validateUser.mockReturnValue(undefined);
    //
    //         await userOperations(oidcUserPlusEmail);
    //
    //         expect(db.createUser).toHaveBeenCalledWith(
    //             expect.any(String),
    //             expect.any(String),
    //             'user+test@example.com',
    //             expect.any(String)
    //         );
    //     });
    //
    //     it('should handle German umlaut characters in name (ä, ö, ü)', async () => {
    //         const germanOidcUser = {
    //             sub: 'oauth_german_umlaut',
    //             name: 'Müller',
    //             email: 'mueller@beispiel.de',
    //         };
    //
    //         db.getUserUnique.mockResolvedValueOnce(null);
    //
    //         const createdUser = {
    //             ...mockDbUser,
    //             name: 'Müller',
    //             email: 'mueller@beispiel.de',
    //             oauth_id: 'oauth_german_umlaut',
    //         };
    //         db.createUser.mockResolvedValue(createdUser);
    //
    //         createOdooUser.mockResolvedValue(undefined);
    //         createSteveUser.mockResolvedValue(undefined);
    //         db.getUserUnique.mockResolvedValueOnce(mockFullyQualifiedUser);
    //         validateUser.mockReturnValue(undefined);
    //
    //         await userOperations(germanOidcUser);
    //
    //         expect(db.createUser).toHaveBeenCalledWith(
    //             'oauth_german_umlaut',
    //             'Müller',
    //             'mueller@beispiel.de',
    //             expect.any(String)
    //         );
    //     });
    //
    //     it('should handle German umlaut characters Ä, Ö, Ü in name', async () => {
    //         const germanOidcUser = {
    //             sub: 'oauth_german_capital',
    //             name: 'Ännchen Östreich',
    //             email: 'oestreich@beispiel.de',
    //         };
    //
    //         db.getUserUnique.mockResolvedValueOnce(null);
    //
    //         const createdUser = {
    //             ...mockDbUser,
    //             name: 'Ännchen Östreich',
    //             email: 'oestreich@beispiel.de',
    //             oauth_id: 'oauth_german_capital',
    //         };
    //         db.createUser.mockResolvedValue(createdUser);
    //
    //         createOdooUser.mockResolvedValue(undefined);
    //         createSteveUser.mockResolvedValue(undefined);
    //         db.getUserUnique.mockResolvedValueOnce(mockFullyQualifiedUser);
    //         validateUser.mockReturnValue(undefined);
    //
    //         await userOperations(germanOidcUser);
    //
    //         expect(db.createUser).toHaveBeenCalledWith(
    //             'oauth_german_capital',
    //             'Ännchen Östreich',
    //             'oestreich@beispiel.de',
    //             expect.any(String)
    //         );
    //     });
    //
    //     it('should handle German ß (Eszett/sharp S) in name', async () => {
    //         const germanOidcUser = {
    //             sub: 'oauth_german_eszett',
    //             name: 'Großmann',
    //             email: 'grossmann@beispiel.de',
    //         };
    //
    //         db.getUserUnique.mockResolvedValueOnce(null);
    //
    //         const createdUser = {
    //             ...mockDbUser,
    //             name: 'Großmann',
    //             email: 'grossmann@beispiel.de',
    //             oauth_id: 'oauth_german_eszett',
    //         };
    //         db.createUser.mockResolvedValue(createdUser);
    //
    //         createOdooUser.mockResolvedValue(undefined);
    //         createSteveUser.mockResolvedValue(undefined);
    //         db.getUserUnique.mockResolvedValueOnce(mockFullyQualifiedUser);
    //         validateUser.mockReturnValue(undefined);
    //
    //         await userOperations(germanOidcUser);
    //
    //         expect(db.createUser).toHaveBeenCalledWith(
    //             'oauth_german_eszett',
    //             'Großmann',
    //             'grossmann@beispiel.de',
    //             expect.any(String)
    //         );
    //     });
    //
    //     it('should handle German umlaut in email local part', async () => {
    //         const germanOidcUser = {
    //             sub: 'oauth_german_email',
    //             name: 'Hans Müller',
    //             email: 'müller@deutsche-firma.de',
    //         };
    //
    //         db.getUserUnique.mockResolvedValueOnce(null);
    //
    //         const createdUser = {
    //             ...mockDbUser,
    //             name: 'Hans Müller',
    //             email: 'müller@deutsche-firma.de',
    //             oauth_id: 'oauth_german_email',
    //         };
    //         db.createUser.mockResolvedValue(createdUser);
    //
    //         createOdooUser.mockResolvedValue(undefined);
    //         createSteveUser.mockResolvedValue(undefined);
    //         db.getUserUnique.mockResolvedValueOnce(mockFullyQualifiedUser);
    //         validateUser.mockReturnValue(undefined);
    //
    //         await userOperations(germanOidcUser);
    //
    //         expect(db.createUser).toHaveBeenCalledWith(
    //             'oauth_german_email',
    //             'Hans Müller',
    //             'müller@deutsche-firma.de',
    //             expect.any(String)
    //         );
    //     });
    //
    //     it('should handle common German compound names with umlauts', async () => {
    //         const germanOidcUser = {
    //             sub: 'oauth_german_compound',
    //             name: 'Käthe Müller-Schön',
    //             email: 'kaethe.mueller-schoen@berlin.de',
    //         };
    //
    //         db.getUserUnique.mockResolvedValueOnce(null);
    //
    //         const createdUser = {
    //             ...mockDbUser,
    //             name: 'Käthe Müller-Schön',
    //             email: 'kaethe.mueller-schoen@berlin.de',
    //             oauth_id: 'oauth_german_compound',
    //         };
    //         db.createUser.mockResolvedValue(createdUser);
    //
    //         createOdooUser.mockResolvedValue(undefined);
    //         createSteveUser.mockResolvedValue(undefined);
    //         db.getUserUnique.mockResolvedValueOnce(mockFullyQualifiedUser);
    //         validateUser.mockReturnValue(undefined);
    //
    //         await userOperations(germanOidcUser);
    //
    //         expect(db.createUser).toHaveBeenCalledWith(
    //             'oauth_german_compound',
    //             'Käthe Müller-Schön',
    //             'kaethe.mueller-schoen@berlin.de',
    //             expect.any(String)
    //         );
    //     });
    //
    //     it('should handle German name with multiple special characters', async () => {
    //         const germanOidcUser = {
    //             sub: 'oauth_german_multi',
    //             name: 'Björn Günther-Überschär',
    //             email: 'bjoern@ueberschaer.de',
    //         };
    //
    //         db.getUserUnique.mockResolvedValueOnce(null);
    //
    //         const createdUser = {
    //             ...mockDbUser,
    //             name: 'Björn Günther-Überschär',
    //             email: 'bjoern@ueberschaer.de',
    //             oauth_id: 'oauth_german_multi',
    //         };
    //         db.createUser.mockResolvedValue(createdUser);
    //
    //         createOdooUser.mockResolvedValue(undefined);
    //         createSteveUser.mockResolvedValue(undefined);
    //         db.getUserUnique.mockResolvedValueOnce(mockFullyQualifiedUser);
    //         validateUser.mockReturnValue(undefined);
    //
    //         await userOperations(germanOidcUser);
    //
    //         expect(db.createUser).toHaveBeenCalledWith(
    //             'oauth_german_multi',
    //             'Björn Günther-Überschär',
    //             'bjoern@ueberschaer.de',
    //             expect.any(String)
    //         );
    //     });
    //
    //     it('should handle existing German user with umlauts', async () => {
    //         const germanOidcUser = {
    //             sub: 'oauth_existing_german',
    //             name: 'Jürgen Köhler',
    //             email: 'juergen@koehler.de',
    //         };
    //
    //         const germanUser = {
    //             ...mockFullyQualifiedUser,
    //             name: 'Jürgen Köhler',
    //             email: 'juergen@koehler.de',
    //             oauth_id: 'oauth_existing_german',
    //         };
    //
    //         db.getUserUnique
    //             .mockResolvedValueOnce(germanUser)
    //             .mockResolvedValueOnce(germanUser);
    //         validateUser.mockReturnValue(undefined);
    //
    //         const result = await userOperations(germanOidcUser);
    //
    //         expect(result.name).toBe('Jürgen Köhler');
    //         expect(result.email).toBe('juergen@koehler.de');
    //         expect(db.createUser).not.toHaveBeenCalled();
    //     });
    //
    //     it('should handle German .de domain extensions', async () => {
    //         const germanOidcUser = {
    //             sub: 'oauth_de_domain',
    //             name: 'Friedrich Straße',
    //             email: 'friedrich@strasse-gmbh.de',
    //         };
    //
    //         db.getUserUnique.mockResolvedValueOnce(null);
    //
    //         const createdUser = {
    //             ...mockDbUser,
    //             name: 'Friedrich Straße',
    //             email: 'friedrich@strasse-gmbh.de',
    //             oauth_id: 'oauth_de_domain',
    //         };
    //         db.createUser.mockResolvedValue(createdUser);
    //
    //         createOdooUser.mockResolvedValue(undefined);
    //         createSteveUser.mockResolvedValue(undefined);
    //         db.getUserUnique.mockResolvedValueOnce(mockFullyQualifiedUser);
    //         validateUser.mockReturnValue(undefined);
    //
    //         await userOperations(germanOidcUser);
    //
    //         expect(db.createUser).toHaveBeenCalledWith(
    //             'oauth_de_domain',
    //             'Friedrich Straße',
    //             'friedrich@strasse-gmbh.de',
    //             expect.any(String)
    //         );
    //     });
    // });
});
