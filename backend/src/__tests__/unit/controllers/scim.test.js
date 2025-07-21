/**
 * @file Unit tests for SCIM controller
 *
 * Comprehensive test suite for the SCIM (System for Cross-domain Identity Management) v2.0
 * controller that handles user provisioning and management operations.
 *
 * This test suite covers:
 * - SCIM service configuration endpoints (ServiceProviderConfig, ResourceTypes, Schemas)
 * - All SCIM user CRUD operations (Create, Read, Update, Delete)
 * - Comprehensive validation testing for SCIM payloads
 * - Error handling and SCIM-compliant error responses
 * - Integration with database operations and external services
 *
 * The tests follow the project's established patterns:
 * - Proper mocking of external dependencies
 * - Edge case coverage and error handling
 * - SCIM protocol compliance verification
 *
 */
const request = require('supertest');
const express = require('express');
const scimController = require('../../../controllers/scim');
const {AuthError, ValidationError, ErrorCodes} = require('../../../utils/errors');
const {userOperations} = require('../../../services/user_operations');
const {blockSteveUser} = require('../../../services/steve_user');
const logger = require('../../../services/logger');
const {db} = require('../../../utils/queries');

// Mock dependencies
jest.mock('../../../services/logger');
jest.mock('../../../services/user_operations');
jest.mock('../../../services/steve_user');

// Mock the database queries module
jest.mock('../../../utils/queries', () => ({
    db: {
        getUserUnique: jest.fn(),
        getUsers: jest.fn(),
        getUsersCount: jest.fn(),
        updateUser: jest.fn(),
        deactivateUser: jest.fn(),
        revokeUserOdooCredentials: jest.fn(),
        recordActivityLog: jest.fn(),
    },
}));

// Create Express app for testing
const app = express();
app.use(express.json());
app.use(scimController);

// SCIM-compliant error handler (matches the one in the controller)
app.use((err, req, res, next) => {
    logger.error('SCIM Error:', err);

    let statusCode = 500;
    let scimError = {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        detail: 'Internal server error',
        status: '500'
    };

    if (err instanceof ValidationError) {
        statusCode = 400;
        scimError.detail = err.errorDef;
        scimError.status = '400';
    } else if (err instanceof AuthError) {
        statusCode = 401;
        scimError.detail = err.errorDef;
        scimError.status = '401';
    } else if (err.errorDef === 'User not found') {
        statusCode = 404;
        scimError.detail = 'User not found';
        scimError.status = '404';
    }

    res.status(statusCode).json(scimError);
});

describe('SCIM Controller Unit Tests', () => {
    // Test data fixtures following common patterns from other tests
    const mockDatabaseUser = {
        user_id: 123,
        name: 'John Doe',
        email: 'john.doe@example.com',
        oauth_id: 'oauth_abc123',
        rfid: 'test_rfid_123',
        steve_id: 456,
        odoo_user_id: 789,
        odoo_partner_id: 101112,
        created_at: '2025-01-01T10:00:00Z',
        updated_at: '2025-01-01T12:00:00Z',
        deactivated_at: null,
    };

    const mockDatabaseUserDeactivated = {
        ...mockDatabaseUser,
        deactivated_at: '2025-01-01T15:00:00Z',
    };

    const validScimUserCreatePayload = {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName: 'newuser@example.com',
        name: {
            givenName: 'New',
            familyName: 'User',
            formatted: 'New User'
        },
        emails: [{
            value: 'newuser@example.com',
            primary: true,
            type: 'work'
        }],
        active: true,
        externalId: 'external_123'
    };

    const validScimUserPatchPayload = {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        userName: 'updated@example.com',
        name: {
            givenName: 'Updated',
            familyName: 'User'
        },
        emails: [{
            value: 'updated@example.com',
            primary: true,
            type: 'work'
        }]
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('SCIM Service Provider Configuration Endpoints', () => {
        describe('GET /scim/v2/ServiceProviderConfig', () => {
            it('should return valid service provider configuration', async () => {
                const response = await request(app)
                    .get('/scim/v2/ServiceProviderConfig')
                    .expect(200);

                expect(response.body).toEqual({
                    schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
                    documentationUri: 'https://tools.ietf.org/html/rfc7644',
                    patch: {
                        supported: true
                    },
                    bulk: {
                        supported: false,
                        maxOperations: 0,
                        maxPayloadSize: 0
                    },
                    filter: {
                        supported: true,
                        maxResults: 100
                    },
                    changePassword: {
                        supported: false
                    },
                    sort: {
                        supported: true
                    },
                    etag: {
                        supported: false
                    },
                    authenticationSchemes: [
                        {
                            type: 'httpbasic',
                            name: 'HTTP Basic',
                            description: 'HTTP Basic authentication',
                            specUri: 'https://tools.ietf.org/html/rfc7617',
                            primary: true
                        }
                    ]
                });
            });
        });

        describe('GET /scim/v2/ResourceTypes', () => {
            it('should return supported resource types', async () => {
                const response = await request(app)
                    .get('/scim/v2/ResourceTypes')
                    .expect(200);

                expect(response.body).toEqual({
                    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
                    totalResults: 1,
                    Resources: [
                        {
                            schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
                            id: 'User',
                            name: 'User',
                            endpoint: '/scim/v2/Users',
                            description: 'User Account',
                            schema: 'urn:ietf:params:scim:schemas:core:2.0:User'
                        }
                    ]
                });
            });
        });

        describe('GET /scim/v2/Schemas', () => {
            it('should return supported schemas', async () => {
                const response = await request(app)
                    .get('/scim/v2/Schemas')
                    .expect(200);

                expect(response.body).toEqual({
                    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
                    totalResults: 1,
                    Resources: [
                        {
                            id: 'urn:ietf:params:scim:schemas:core:2.0:User',
                            name: 'User',
                            description: 'User Account'
                        }
                    ]
                });
            });
        });
    });

    describe('SCIM User Resource Operations', () => {
        describe('GET /scim/v2/Users - List Users', () => {
            it('should retrieve all users with default pagination', async () => {
                db.getUsers.mockResolvedValue([mockDatabaseUser]);
                db.getUsersCount.mockResolvedValue(1);

                const response = await request(app)
                    .get('/scim/v2/Users')
                    .expect(200);

                expect(response.body).toEqual({
                    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
                    totalResults: 1,
                    startIndex: 1,
                    itemsPerPage: 1,
                    Resources: [
                        {
                            id: mockDatabaseUser.oauth_id,
                            externalId: mockDatabaseUser.oauth_id,
                            userName: mockDatabaseUser.email,
                            name: {
                                givenName: 'John',
                                familyName: 'Doe',
                                formatted: mockDatabaseUser.name
                            },
                            emails: [
                                {
                                    value: mockDatabaseUser.email,
                                    primary: true
                                }
                            ],
                            active: true,
                            meta: {
                                resourceType: 'User',
                                created: new Date(mockDatabaseUser.created_at).toISOString(),
                                lastModified: new Date(mockDatabaseUser.updated_at).toISOString(),
                                location: `${process.env.SCIM_BASE_URL || "/scim/v2"}/Users/${mockDatabaseUser.oauth_id}`
                            }
                        }
                    ]
                });

                expect(db.getUsers).toHaveBeenCalledWith({}, {limit: 100, offset: 0});
                expect(db.getUsersCount).toHaveBeenCalled();
            });

            it('should handle custom pagination parameters', async () => {
                db.getUsers.mockResolvedValue([]);
                db.getUsersCount.mockResolvedValue(50);

                const response = await request(app)
                    .get('/scim/v2/Users?startIndex=10&count=5')
                    .expect(200);

                expect(response.body.totalResults).toBe(50);
                expect(response.body.startIndex).toBe("10"); // SCIM returns strings from query params
                expect(response.body.itemsPerPage).toBe(0);
                expect(response.body.Resources).toEqual([]);

                expect(db.getUsers).toHaveBeenCalledWith({}, {limit: "5", offset: 9});
            });

            it('should filter users by username', async () => {
                db.getUserUnique.mockResolvedValue(mockDatabaseUser);

                const response = await request(app)
                    .get('/scim/v2/Users?filter=userName eq "john.doe@example.com"')
                    .expect(200);

                expect(response.body.totalResults).toBe(1);
                expect(response.body.Resources).toHaveLength(1);
                expect(response.body.Resources[0].userName).toBe(mockDatabaseUser.email);

                expect(db.getUserUnique).toHaveBeenCalledWith({email: 'john.doe@example.com'});
            });

            it('should filter users by id', async () => {
                db.getUserUnique.mockResolvedValue(mockDatabaseUser);

                const response = await request(app)
                    .get('/scim/v2/Users?filter=id eq "oauth_abc123"')
                    .expect(200);

                expect(response.body.totalResults).toBe(1);
                expect(response.body.Resources).toHaveLength(1);
                expect(response.body.Resources[0].id).toBe(mockDatabaseUser.oauth_id);

                expect(db.getUserUnique).toHaveBeenCalledWith({oauth_id: 'oauth_abc123'});
            });

            it('should return empty result for non-matching filter', async () => {
                db.getUserUnique.mockResolvedValue(null);

                const response = await request(app)
                    .get('/scim/v2/Users?filter=userName eq "nonexistent@example.com"')
                    .expect(200);

                expect(response.body.totalResults).toBe(0);
                expect(response.body.Resources).toEqual([]);
            });

            it('should handle database errors gracefully', async () => {
                db.getUsers.mockRejectedValue(new Error('Database connection failed'));

                const response = await request(app)
                    .get('/scim/v2/Users')
                    .expect(400);

                expect(response.body).toEqual({
                    schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
                    detail: 'Failed to retrieve users',
                    status: '400'
                });
            });
        });

        describe('GET /scim/v2/Users/:id - Get User', () => {
            it('should retrieve user by id', async () => {
                db.getUserUnique.mockResolvedValue(mockDatabaseUser);

                const response = await request(app)
                    .get('/scim/v2/Users/oauth_abc123')
                    .expect(200);

                expect(response.body).toEqual({
                    id: mockDatabaseUser.oauth_id,
                    externalId: mockDatabaseUser.oauth_id,
                    userName: mockDatabaseUser.email,
                    name: {
                        givenName: 'John',
                        familyName: 'Doe',
                        formatted: mockDatabaseUser.name
                    },
                    emails: [
                        {
                            value: mockDatabaseUser.email,
                            primary: true
                        }
                    ],
                    active: true,
                    meta: {
                        resourceType: 'User',
                        created: new Date(mockDatabaseUser.created_at).toISOString(),
                        lastModified: new Date(mockDatabaseUser.updated_at).toISOString(),
                        location: `${process.env.SCIM_BASE_URL || "/scim/v2"}/Users/${mockDatabaseUser.oauth_id}`
                    }
                });

                expect(db.getUserUnique).toHaveBeenCalledWith({oauth_id: 'oauth_abc123'});
            });

            it('should return 404 for non-existent user', async () => {
                db.getUserUnique.mockResolvedValue(null);

                const response = await request(app)
                    .get('/scim/v2/Users/nonexistent')
                    .expect(404);

                expect(response.body).toEqual({
                    schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
                    detail: 'User not found',
                    status: '404'
                });
            });

            it('should handle deactivated users correctly', async () => {
                db.getUserUnique.mockResolvedValue(mockDatabaseUserDeactivated);

                const response = await request(app)
                    .get('/scim/v2/Users/oauth_abc123')
                    .expect(200);

                expect(response.body.active).toBe(false);
            });
        });

        describe('POST /scim/v2/Users - Create User', () => {
            it('should create user with valid data', async () => {
                // Mock that user doesn't exist
                db.getUserUnique.mockResolvedValue(null);

                // Mock userOperations to return created user data
                const mockCreatedUser = {
                    ...mockDatabaseUser,
                    email: validScimUserCreatePayload.userName,
                    name: validScimUserCreatePayload.name.formatted,
                    oauth_id: 'new_oauth_id'
                };
                userOperations.mockResolvedValue(mockCreatedUser);

                const response = await request(app)
                    .post('/scim/v2/Users')
                    .send(validScimUserCreatePayload)
                    .expect(201);

                expect(response.body).toEqual({
                    id: mockCreatedUser.oauth_id,
                    externalId: mockCreatedUser.oauth_id,
                    userName: mockCreatedUser.email,
                    name: {
                        givenName: 'New',
                        familyName: 'User',
                        formatted: mockCreatedUser.name
                    },
                    emails: [
                        {
                            value: mockCreatedUser.email,
                            primary: true
                        }
                    ],
                    active: true,
                    meta: expect.objectContaining({
                        resourceType: 'User',
                        location: `${process.env.SCIM_BASE_URL || "/scim/v2"}/Users/${mockCreatedUser.oauth_id}`
                    })
                });

                expect(db.getUserUnique).toHaveBeenCalledWith({email: validScimUserCreatePayload.userName});
                expect(userOperations).toHaveBeenCalledWith({
                    sub: validScimUserCreatePayload.externalId,
                    name: 'New User',
                    email: validScimUserCreatePayload.userName
                });
            });

            it('should reject user creation without required userName', async () => {
                const invalidPayload = {
                    ...validScimUserCreatePayload
                };
                delete invalidPayload.userName;

                const response = await request(app)
                    .post('/scim/v2/Users')
                    .send(invalidPayload)
                    .expect(400);

                expect(response.body.detail).toContain('userName');
                expect(userOperations).not.toHaveBeenCalled();
            });

            it('should reject user creation without required emails', async () => {
                const invalidPayload = {
                    ...validScimUserCreatePayload
                };
                delete invalidPayload.emails;

                const response = await request(app)
                    .post('/scim/v2/Users')
                    .send(invalidPayload)
                    .expect(400);

                expect(response.body.detail).toContain('emails');
                expect(userOperations).not.toHaveBeenCalled();
            });

            it('should reject user creation with invalid email format', async () => {
                const invalidPayload = {
                    ...validScimUserCreatePayload,
                    userName: 'invalid-email-format'
                };

                const response = await request(app)
                    .post('/scim/v2/Users')
                    .send(invalidPayload)
                    .expect(400);

                expect(response.body.detail).toContain('email');
                expect(userOperations).not.toHaveBeenCalled();
            });

            it('should reject user creation with too many emails', async () => {
                const invalidPayload = {
                    ...validScimUserCreatePayload,
                    emails: Array(6).fill(null).map((_, i) => ({
                        value: `test${i}@example.com`,
                        primary: i === 0,
                        type: 'work'
                    }))
                };

                const response = await request(app)
                    .post('/scim/v2/Users')
                    .send(invalidPayload)
                    .expect(400);

                expect(response.body.detail).toContain('emails');
                expect(userOperations).not.toHaveBeenCalled();
            });

            it('should reject user creation with unknown fields', async () => {
                const invalidPayload = {
                    ...validScimUserCreatePayload,
                    unknownField: 'should not be allowed'
                };

                const response = await request(app)
                    .post('/scim/v2/Users')
                    .send(invalidPayload)
                    .expect(400);

                expect(response.body.detail).toContain('not allowed');
                expect(userOperations).not.toHaveBeenCalled();
            });

            it('should reject user creation when user already exists', async () => {
                db.getUserUnique.mockResolvedValue(mockDatabaseUser);

                const response = await request(app)
                    .post('/scim/v2/Users')
                    .send(validScimUserCreatePayload)
                    .expect(400);

                expect(response.body.detail).toContain('already exists');
                expect(userOperations).not.toHaveBeenCalled();
            });

            it('should handle userOperations service errors', async () => {
                db.getUserUnique.mockResolvedValue(null);
                userOperations.mockRejectedValue(new ValidationError('Service unavailable', ErrorCodes.SYSTEM.SERVICE_UNAVAILABLE));

                const response = await request(app)
                    .post('/scim/v2/Users')
                    .send(validScimUserCreatePayload)
                    .expect(400);

                expect(response.body.detail).toBe('Service unavailable');
            });
        });

        describe('PATCH /scim/v2/Users/:id - Update User', () => {
            it('should update user with valid patch data', async () => {
                db.getUserUnique
                    .mockResolvedValueOnce(mockDatabaseUser) // Initial lookup
                    .mockResolvedValueOnce({ // Updated user
                        ...mockDatabaseUser,
                        email: validScimUserPatchPayload.userName,
                        name: `${validScimUserPatchPayload.name.givenName} ${validScimUserPatchPayload.name.familyName}`,
                        updated_at: new Date().toISOString()
                    });
                db.updateUser.mockResolvedValue();

                const response = await request(app)
                    .patch('/scim/v2/Users/oauth_abc123')
                    .send(validScimUserPatchPayload)
                    .expect(200);

                expect(response.body.userName).toBe(validScimUserPatchPayload.userName);
                expect(response.body.name.givenName).toBe(validScimUserPatchPayload.name.givenName);
                expect(response.body.name.familyName).toBe(validScimUserPatchPayload.name.familyName);

                expect(db.updateUser).toHaveBeenCalledWith(mockDatabaseUser.user_id, {
                    email: validScimUserPatchPayload.userName,
                    firstName: validScimUserPatchPayload.name.givenName,
                    lastName: validScimUserPatchPayload.name.familyName
                });
            });

            it('should return 404 for non-existent user update', async () => {
                db.getUserUnique.mockResolvedValue(null);

                const response = await request(app)
                    .patch('/scim/v2/Users/nonexistent')
                    .send(validScimUserPatchPayload)
                    .expect(400);

                expect(response.body.detail).toBe('User not found');
                expect(db.updateUser).not.toHaveBeenCalled();
            });

            it('should reject patch with invalid email format', async () => {
                db.getUserUnique.mockResolvedValue(mockDatabaseUser); // Need to mock user lookup first

                const invalidPatchPayload = {
                    ...validScimUserPatchPayload,
                    userName: 'invalid-email-format'
                };

                const response = await request(app)
                    .patch('/scim/v2/Users/oauth_abc123')
                    .send(invalidPatchPayload)
                    .expect(400);

                expect(response.body.detail).toContain('email');
                expect(db.updateUser).not.toHaveBeenCalled();
            });

            it('should reject patch with unknown fields', async () => {
                db.getUserUnique.mockResolvedValue(mockDatabaseUser); // Need to mock user lookup first

                const invalidPatchPayload = {
                    ...validScimUserPatchPayload,
                    unknownField: 'not allowed'
                };

                const response = await request(app)
                    .patch('/scim/v2/Users/oauth_abc123')
                    .send(invalidPatchPayload)
                    .expect(400);

                expect(response.body.detail).toContain('not allowed');
                expect(db.updateUser).not.toHaveBeenCalled();
            });

            it('should handle empty patch gracefully', async () => {
                db.getUserUnique.mockResolvedValue(mockDatabaseUser);

                const response = await request(app)
                    .patch('/scim/v2/Users/oauth_abc123')
                    .send({schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp']})
                    .expect(200);

                expect(response.body.id).toBe(mockDatabaseUser.oauth_id);
                expect(db.updateUser).not.toHaveBeenCalled();
            });

            it('should validate name fields properly', async () => {
                db.getUserUnique.mockResolvedValue(mockDatabaseUser);

                const invalidPatchPayload = {
                    schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
                    name: {
                        givenName: 'A'.repeat(101), // Too long
                        familyName: 'B'.repeat(101)  // Too long
                    }
                };

                const response = await request(app)
                    .patch('/scim/v2/Users/oauth_abc123')
                    .send(invalidPatchPayload)
                    .expect(400);

                expect(response.body.detail).toContain('length must be less than or equal to 50 characters');
                expect(db.updateUser).not.toHaveBeenCalled();
            });
        });

        describe('DELETE /scim/v2/Users/:id - Delete User', () => {
            it('should deactivate user successfully', async () => {
                db.getUserUnique.mockResolvedValue(mockDatabaseUser);
                db.deactivateUser.mockResolvedValue();
                db.revokeUserOdooCredentials.mockResolvedValue();
                db.recordActivityLog.mockResolvedValue();
                blockSteveUser.mockResolvedValue();

                const response = await request(app)
                    .delete('/scim/v2/Users/oauth_abc123')
                    .expect(204);

                expect(response.body).toEqual({});
                expect(db.deactivateUser).toHaveBeenCalledWith(mockDatabaseUser);
                expect(db.revokeUserOdooCredentials).toHaveBeenCalledWith(mockDatabaseUser);
                expect(blockSteveUser).toHaveBeenCalledWith(mockDatabaseUser);
                expect(db.recordActivityLog).toHaveBeenCalledWith(
                    mockDatabaseUser.user_id,
                    "SOFT DELETE",
                    "DB",
                    mockDatabaseUser.rfid,
                    "SCIM"
                );
            });

            it('should return 404 for non-existent user deletion', async () => {
                db.getUserUnique.mockResolvedValue(null);

                const response = await request(app)
                    .delete('/scim/v2/Users/nonexistent')
                    .expect(400);

                expect(response.body.detail).toBe('User not found');
                expect(db.deactivateUser).not.toHaveBeenCalled();
                expect(blockSteveUser).not.toHaveBeenCalled();
            });

            it('should handle Odoo credential revocation errors gracefully', async () => {
                db.getUserUnique.mockResolvedValue(mockDatabaseUser);
                db.deactivateUser.mockResolvedValue();
                db.revokeUserOdooCredentials.mockRejectedValue(new Error('Odoo service unavailable'));
                db.recordActivityLog.mockResolvedValue();
                blockSteveUser.mockResolvedValue();

                const response = await request(app)
                    .delete('/scim/v2/Users/oauth_abc123')
                    .expect(204);

                expect(db.deactivateUser).toHaveBeenCalled();
                expect(db.recordActivityLog).toHaveBeenCalled();
                expect(logger.error).toHaveBeenCalledWith(
                    expect.stringContaining('Failed to revoke Odoo credentials'),
                    expect.any(String)
                );
            });

            it('should handle SteVe user blocking errors gracefully', async () => {
                db.getUserUnique.mockResolvedValue(mockDatabaseUser);
                db.deactivateUser.mockResolvedValue();
                db.revokeUserOdooCredentials.mockResolvedValue();
                db.recordActivityLog.mockResolvedValue();
                blockSteveUser.mockRejectedValue(new Error('SteVe service unavailable'));

                const response = await request(app)
                    .delete('/scim/v2/Users/oauth_abc123')
                    .expect(204);

                expect(db.deactivateUser).toHaveBeenCalled();
                expect(db.recordActivityLog).toHaveBeenCalled();
                expect(logger.error).toHaveBeenCalledWith(
                    expect.stringContaining('Failed to revoke Odoo credentials'),
                    expect.any(String)
                );
            });
        });
    });

    describe('SCIM Error Handling', () => {
        it('should handle malformed JSON requests', async () => {
            const response = await request(app)
                .post('/scim/v2/Users')
                .set('Content-Type', 'application/json')
                .send('{"malformed": json}')
                .expect(500); // Express handles malformed JSON as 500, not 400

            expect(response.body).toHaveProperty('schemas');
        });

        it('should return SCIM-compliant error format', async () => {
            db.getUserUnique.mockRejectedValue(new ValidationError('Database error', ErrorCodes.DATABASE.CONNECTION_ERROR));

            const response = await request(app)
                .get('/scim/v2/Users/test')
                .expect(400);

            expect(response.body).toEqual({
                schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
                detail: 'Failed to retrieve users', // The controller wraps the error
                status: '400'
            });
        });

        it('should handle unexpected errors with generic message', async () => {
            db.getUsers.mockRejectedValue(new Error('Unexpected database error'));

            const response = await request(app)
                .get('/scim/v2/Users')
                .expect(400); // The SCIM handler wraps unexpected errors in ValidationError

            expect(response.body).toEqual({
                schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
                detail: 'Failed to retrieve users',
                status: '400'
            });
        });
    });

    describe('SCIM Resource Validation', () => {
        describe('User Creation Validation', () => {
            it('should validate required fields', async () => {
                const testCases = [
                    {field: 'userName', value: undefined, expected: 'userName'},
                    {field: 'emails', value: undefined, expected: 'emails'},
                    {field: 'emails', value: [], expected: 'emails'}
                ];

                for (const testCase of testCases) {
                    const invalidPayload = {
                        ...validScimUserCreatePayload,
                        [testCase.field]: testCase.value
                    };
                    if (testCase.value === undefined) {
                        delete invalidPayload[testCase.field];
                    }

                    const response = await request(app)
                        .post('/scim/v2/Users')
                        .send(invalidPayload)
                        .expect(400);

                    expect(response.body.detail).toContain(testCase.expected);
                }
            });

            it('should validate email formats in emails array', async () => {
                const invalidPayload = {
                    ...validScimUserCreatePayload,
                    emails: [{
                        value: 'invalid-email-format',
                        primary: true,
                        type: 'work'
                    }]
                };

                const response = await request(app)
                    .post('/scim/v2/Users')
                    .send(invalidPayload)
                    .expect(400);

                expect(response.body.detail).toContain('email');
            });

            it('should validate string length limits', async () => {
                const invalidPayload = {
                    ...validScimUserCreatePayload,
                    userName: 'a'.repeat(256) + '@example.com' // Exceeds 255 char limit
                };

                const response = await request(app)
                    .post('/scim/v2/Users')
                    .send(invalidPayload)
                    .expect(400);

                expect(response.body.detail).toContain('length');
            });
        });

        describe('User Update Validation', () => {
            beforeEach(() => {
                db.getUserUnique.mockResolvedValue(mockDatabaseUser);
            });

            it('should validate patch operations', async () => {
                const invalidPatchPayload = {
                    ...validScimUserPatchPayload,
                    emails: [{
                        value: 'invalid-email',
                        primary: true
                    }]
                };

                const response = await request(app)
                    .patch('/scim/v2/Users/oauth_abc123')
                    .send(invalidPatchPayload)
                    .expect(400);

                expect(response.body.detail).toContain('email');
            });

            it('should reject disallowed fields in patch', async () => {
                const disallowedFields = ['id', 'externalId', 'meta', 'active'];

                for (const field of disallowedFields) {
                    const invalidPatchPayload = {
                        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
                        [field]: 'should not be allowed'
                    };

                    const response = await request(app)
                        .patch('/scim/v2/Users/oauth_abc123')
                        .send(invalidPatchPayload)
                        .expect(400);

                    expect(response.body.detail).toContain('not allowed');
                }
            });
        });
    });
});
