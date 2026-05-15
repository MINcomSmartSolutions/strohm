/**
 * @file Unit tests for Steve user service
 */
const {
    createSteveUser,
    getSteveUser,
    blockSteveUser,
    unblockSteveUser,
} = require('#services/steve_user');
const {steveAxios} = require('#services/network');
const {db} = require('#utils/queries');
const {validateSteveUser} = require('#utils/steve');
const {ValidationError, SystemError, ErrorCodes} = require('#utils/errors');
const {STEVE_CONFIG} = require('#config');

// TODO: Needs reviewing

// Mock dependencies
jest.mock('#services/network', () => ({
    steveAxios: {
        post: jest.fn(),
        get: jest.fn(),
        put: jest.fn(),
    },
}));

jest.mock('#utils/queries', () => ({
    db: {
        setSteveUserParamaters: jest.fn(),
        recordActivityLog: jest.fn(),
    },
}));

jest.mock('#utils/steve', () => ({
    validateSteveUser: jest.fn(),
}));

jest.mock('#config', () => ({
    STEVE_CONFIG: {
        OCPP_TAGS_URI: '/api/v1/tags',
        IS_HEALTHY: true,
    },
    GLOBAL_CONFIG: {
        MAX_RFID_LENGTH: 36,
        ENV: {
            IS_PRODUCTION: false,
        }
    }
}));

describe('Steve User Service', () => {
    // Common test user variables with clear naming
    const validUser = {
        user_id: 123,
        name: 'Test User',
        email: 'test@example.com',
        oauth_id: 'oauth123',
        rfid: 'test_rfid',
        steve_id: null,
    };

    const fullQualifiedUser = {
        user_id: 123,
        name: 'Test User',
        email: 'test@example.com',
        odoo_user_id: 789,
        odoo_partner_id: 101112,
        oauth_id: 'oauth123',
        rfid: 'test_rfid',
        steve_id: 999,
    };

    const invalidUser = {
        user_id: 123,
        name: 'Test User',
        email: 'test@example.com',
        oauth_id: 'oauth123',
        rfid: '',  // Invalid because rfid is empty
        steve_id: null, // Invalid because steve_id is empty
    };


    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createSteveUser', () => {
        it('should throw error if user has invalid RFID', async () => {
            await expect(createSteveUser(invalidUser)).rejects.toThrow(ValidationError);
            await createSteveUser(invalidUser).catch(err => {
                expect(err.errorDef.code).toBe(ErrorCodes.VALIDATION.INVALID_PARAMETERS.code);
            });
        });

        // it('should throw error if user has invalid ocppTagPk parameter', async () => {
        //     const userWithInvalidEmail =  { ...fullQualifiedUser, steve_id: 'not-a-number' };
        //
        //     steveAxios.get.mockResolvedValue({
        //         status: 200,
        //         data: [{
        //             ocppTagPk: 999,
        //             idTag: 'test_rfid',
        //             maxActiveTransactionCount: 0,
        //             blocked: true,
        //         }],
        //     });
        //
        //     // The new service will call getSteveUser, which will return a response, but the test must also mock the second get call to avoid 'No response received from SteVe'
        //     // So, mock the second call as well
        //     steveAxios.get.mockResolvedValueOnce({status: 200, data: [{ocppTagPk: 'not-a-number', idTag: 'test_rfid'}]});
        //
        //
        //     await expect(createSteveUser(userWithInvalidEmail)).rejects.toThrow(ValidationError);
        //     await createSteveUser(userWithInvalidEmail).catch(err => {
        //         expect(err.errorDef.code).toBe(ErrorCodes.VALIDATION.INVALID_PARAMETERS.code);
        //     });
        // });

        it('should throw error if user is missing', async () => {
            await expect(createSteveUser(undefined)).rejects.toThrow(ValidationError);
            await createSteveUser(undefined).catch(err => {
                expect(err.errorDef.code).toBe(ErrorCodes.VALIDATION.INVALID_PARAMETERS.code);
            });
        });

        it('should throw SystemError if SteVe returns no response on create', async () => {
            steveAxios.get.mockResolvedValue({status: 200, data: []});
            steveAxios.post.mockResolvedValue(undefined);

            await expect(createSteveUser(validUser)).rejects.toThrow(SystemError);
            await createSteveUser(validUser).catch(err => {
                expect(err.errorDef.code).toBe(ErrorCodes.STEVE.NO_RESPONSE.code);
            });
        });

        it('should throw SystemError if SteVe returns non-201 status on create', async () => {
            steveAxios.get.mockResolvedValue({status: 200, data: []});
            steveAxios.post.mockResolvedValue({status: 500, statusText: 'Internal Server Error'});

            await expect(createSteveUser(validUser)).rejects.toThrow(SystemError);
            await createSteveUser(validUser).catch(err => {
                expect(err.errorDef.code).toBe(ErrorCodes.STEVE.USER_CREATE_FAILED.code);
            });
        });

        it('should create user successfully with blocked status', async () => {
            // Mock getSteveUser to return null (user doesn't exist)
            steveAxios.get.mockResolvedValueOnce({
                status: 200,
                data: [],
            });

            // Mock successful creation response
            const mockCreateResponse = {
                status: 201,
                data: {
                    ocppTagPk: 999,
                    idTag: 'test_rfid',
                    maxActiveTransactionCount: 0,
                    blocked: true,
                },
            };
            steveAxios.post.mockResolvedValue(mockCreateResponse);

            // Mock successful get after creation
            steveAxios.get.mockResolvedValueOnce({
                status: 200,
                data: [{
                    ocppTagPk: 999,
                    idTag: 'test_rfid',
                    maxActiveTransactionCount: 0,
                    blocked: true,
                }],
            });

            const result = await createSteveUser(validUser, true);

            // Verify post was called with correct data for blocked user
            expect(steveAxios.post).toHaveBeenCalledWith(
                STEVE_CONFIG.OCPP_TAGS_URI,
                {
                    idTag: validUser.rfid,
                    maxActiveTransactionCount: 0,
                    note: 'RFID created with API by MINcom Smart Solutions GmbH',
                },
            );

            // Verify user validation was called
            expect(validateSteveUser).toHaveBeenCalledWith(mockCreateResponse.data, validUser.rfid);

            // Verify Steve ID was stored in database
            expect(db.setSteveUserParamaters).toHaveBeenCalledWith(validUser, 999);

            // Verify activity logs were recorded
            expect(db.recordActivityLog).toHaveBeenCalledWith(validUser.user_id, 'CREATE USER', 'SteVe', validUser.rfid, null);
            expect(db.recordActivityLog).toHaveBeenCalledWith(validUser.user_id, 'BLOCK USER', 'SteVe', validUser.rfid, "User is created as blocked");

            expect(result).toEqual(mockCreateResponse.data);
        });

        it('should create user successfully with unblocked status', async () => {
            // Mock getSteveUser to return null (user doesn't exist)
            steveAxios.get.mockResolvedValueOnce({
                status: 200,
                data: [],
            });

            // Mock successful creation response
            const mockCreateResponse = {
                status: 201,
                data: {
                    ocppTagPk: 999,
                    idTag: 'test_rfid',
                    maxActiveTransactionCount: 1,
                    blocked: false,
                },
            };
            steveAxios.post.mockResolvedValueOnce(mockCreateResponse);

            // Mock successful get after creation
            steveAxios.get.mockResolvedValueOnce({
                status: 200,
                data: [{
                    ocppTagPk: 999,
                    idTag: 'test_rfid',
                    maxActiveTransactionCount: 1,
                    blocked: false,
                }],
            });

            const result = await createSteveUser(validUser, false);

            // Verify post was called with correct data for unblocked user
            expect(steveAxios.post).toHaveBeenCalledWith(
                STEVE_CONFIG.OCPP_TAGS_URI,
                {
                    idTag: validUser.rfid,
                    maxActiveTransactionCount: 1,
                    note: 'RFID created with API by MINcom Smart Solutions GmbH',
                },
            );

            // Verify only CREATE USER log was recorded (not BLOCK USER)
            expect(db.recordActivityLog).toHaveBeenCalledTimes(1);
            expect(db.recordActivityLog).toHaveBeenCalledWith(validUser.user_id, 'CREATE USER', 'SteVe', validUser.rfid, null);

            expect(result).toEqual({
                ocppTagPk: 999,
                idTag: 'test_rfid',
                maxActiveTransactionCount: 1,
                blocked: false,
            });
        });

        it('should throw error when creation fails', async () => {
            // Mock getSteveUser to return null (user doesn't exist)
            steveAxios.get.mockResolvedValue({
                status: 200,
                data: [],
            });

            // Mock failed creation response
            steveAxios.post.mockResolvedValue({
                status: 500,
            });

            await expect(createSteveUser(validUser)).rejects.toThrow(SystemError);
            await createSteveUser(validUser).catch(err => {
                expect(err.errorDef.code).toBe(ErrorCodes.STEVE.USER_CREATE_FAILED.code);
            });
        });

        it('should throw SystemError if user cannot be found after creation', async () => {
            // Mock getSteveUser to return null (user doesn't exist)
            steveAxios.get.mockResolvedValue({
                status: 200,
                data: [],
            });

            // Mock successful creation response
            const mockCreateResponse = {
                status: 201,
                data: {
                    ocppTagPk: 999,
                    idTag: 'test_rfid',
                    maxActiveTransactionCount: 0,
                    blocked: true,
                },
            };
            steveAxios.post.mockResolvedValue(mockCreateResponse);

            // Mock failed get after creation (user not found)
            steveAxios.get.mockResolvedValue({
                status: 200,
                data: [],
            });

            await expect(createSteveUser(validUser)).rejects.toThrow(SystemError);
            await createSteveUser(validUser).catch(err => {
                expect(err.errorDef.code).toBe(ErrorCodes.STEVE.USER_NOT_FOUND.code);
            });
        });
    });

    describe('getSteveUser', () => {
        it('should throw error if RFID is invalid', async () => {
            await expect(getSteveUser('')).rejects.toThrow(ValidationError);
            await getSteveUser('').catch(err => {
                expect(err.errorDef.code).toBe(ErrorCodes.VALIDATION.INVALID_PARAMETERS.code);
            });
            await getSteveUser(null).catch(err => {
                expect(err.errorDef.code).toBe(ErrorCodes.VALIDATION.INVALID_PARAMETERS.code);
            });
        });

        it('should throw SystemError if SteVe returns no response', async () => {
            steveAxios.get.mockResolvedValueOnce(undefined);
            await expect(getSteveUser('test_rfid')).rejects.toThrow(SystemError);
            await getSteveUser('test_rfid').catch(err => {
                expect(err.errorDef.code).toBe(ErrorCodes.STEVE.NO_RESPONSE.code);
            });
        });

        it('should throw SystemError if SteVe returns non-200 status', async () => {
            steveAxios.get.mockResolvedValueOnce({status: 500, statusText: 'Internal Server Error'});
            await expect(getSteveUser('test_rfid')).rejects.toThrow(SystemError);
            await getSteveUser('test_rfid').catch(err => {
                expect(err.errorDef.code).toBe(ErrorCodes.STEVE.USER_GET_FAILED.code);
            });
        });

        it('should return null if user not found', async () => {
            steveAxios.get.mockResolvedValueOnce({status: 200, data: []});
            const result = await getSteveUser('test_rfid');
            expect(result).toBeNull();
        });

        it('should throw SystemError if multiple users found', async () => {
            steveAxios.get.mockResolvedValueOnce({
                status: 200,
                data: [
                    {ocppTagPk: 999, idTag: 'test_rfid'},
                    {ocppTagPk: 1000, idTag: 'test_rfid'},
                ],
            });
            await expect(getSteveUser('test_rfid')).rejects.toThrow(SystemError);
            await getSteveUser('test_rfid').catch(err => {
                expect(err.errorDef.code).toBe(ErrorCodes.STEVE.USER_MULTIPLE_FOUND.code);
            });
        });

        it('should return user data if found', async () => {
            const mockUser = {
                ocppTagPk: 999,
                idTag: 'test_rfid',
                maxActiveTransactionCount: 0,
                blocked: true,
            };
            steveAxios.get.mockResolvedValueOnce({status: 200, data: [mockUser]});
            const result = await getSteveUser('test_rfid');
            expect(steveAxios.get).toHaveBeenCalledWith(
                STEVE_CONFIG.OCPP_TAGS_URI,
                {
                    params: {
                        idTag: 'test_rfid',
                    },
                },
            );
            expect(validateSteveUser).toHaveBeenCalledWith(mockUser, 'test_rfid');
            expect(result).toEqual(mockUser);
        });
    });

    describe('blockSteveUser', () => {
        it('should throw error if rfid is invalid', async () => {
            const badUser = {user_id: 'not-a-number', rfid: '', steve_id: 999};

            await expect(blockSteveUser(badUser)).rejects.toThrow(ValidationError);
            await blockSteveUser(badUser).catch(err => {
                expect(err.errorDef.code).toBe(ErrorCodes.VALIDATION.INVALID_PARAMETERS.code);
            });
        });

        it('should throw SystemError if SteVe returns no response on block', async () => {
            steveAxios.put.mockResolvedValue(undefined);

            await expect(blockSteveUser(fullQualifiedUser)).rejects.toThrow(SystemError);
            await blockSteveUser(fullQualifiedUser).catch(err => {
                expect(err.errorDef.code).toBe(ErrorCodes.STEVE.NO_RESPONSE.code);
            });
        });

        it('should throw SystemError if SteVe returns non-200 status on block', async () => {
            steveAxios.put.mockResolvedValue({status: 500, statusText: 'Internal Server Error'});

            await expect(blockSteveUser(fullQualifiedUser)).rejects.toThrow(SystemError);
            +
                await blockSteveUser(fullQualifiedUser).catch(err => {
                    expect(err.errorDef.code).toBe(ErrorCodes.STEVE.USER_BLOCK_FAILED.code);
                });
        });

        it('should throw SystemError if user could not be blocked', async () => {
            steveAxios.put.mockResolvedValue({
                status: 200,
                data: {
                    ocppTagPk: 999,
                    idTag: 'test_rfid',
                    maxActiveTransactionCount: 1, // Should be 0 for blocked
                    blocked: false, // Should be true for blocked
                },
            });
            await expect(blockSteveUser(fullQualifiedUser)).rejects.toThrow(SystemError);
            await blockSteveUser(fullQualifiedUser).catch(err => {
                expect(err.errorDef.code).toBe(ErrorCodes.STEVE.USER_BLOCK_FAILED.code);
            });
        });

        it('should block user successfully', async () => {
            steveAxios.put.mockResolvedValueOnce({
                status: 200,
                data: {
                    ocppTagPk: 999,
                    idTag: 'test_rfid',
                    maxActiveTransactionCount: 0,
                    blocked: true,
                },
            });
            await blockSteveUser(fullQualifiedUser);
            expect(steveAxios.put).toHaveBeenCalledWith(
                `${STEVE_CONFIG.OCPP_TAGS_URI}/${fullQualifiedUser.steve_id}`,
                {
                    idTag: fullQualifiedUser.rfid,
                    maxActiveTransactionCount: 0,
                    note: expect.any(String),
                    expiredAt: null,
                },
            );
            expect(db.recordActivityLog).toHaveBeenCalledWith(
                fullQualifiedUser.user_id,
                'BLOCK USER',
                'SteVe',
                fullQualifiedUser.rfid,
                null
            );
        });
    });

    describe('unblockSteveUser', () => {
        it('should throw error if rfid is invalid', async () => {
            const badUser = {user_id: 123, rfid: '', steve_id: 999}; // Empty RFID
            await expect(unblockSteveUser(badUser)).rejects.toThrow(ValidationError);
            await unblockSteveUser(badUser).catch(err => {
                expect(err.errorDef.code).toBe(ErrorCodes.VALIDATION.INVALID_PARAMETERS.code);
            });
        });

        it('should throw SystemError if SteVe returns no response on unblock', async () => {
            steveAxios.put.mockResolvedValueOnce(undefined);
            await expect(unblockSteveUser(fullQualifiedUser)).rejects.toThrow(SystemError);
            await unblockSteveUser(fullQualifiedUser).catch(err => {
                expect(err.errorDef.code).toBe(ErrorCodes.STEVE.NO_RESPONSE.code);
            });
        });

        it('should throw SystemError if SteVe returns non-200 status on unblock', async () => {
            steveAxios.put.mockResolvedValueOnce({status: 500, statusText: 'Internal Server Error'});
            await expect(unblockSteveUser(fullQualifiedUser)).rejects.toThrow(SystemError);
            await unblockSteveUser(fullQualifiedUser).catch(err => {
                expect(err.errorDef.code).toBe(ErrorCodes.STEVE.USER_UNBLOCK_FAILED.code);
            });
        });

        it('should throw SystemError if user could not be unblocked', async () => {
            steveAxios.put.mockResolvedValueOnce({
                status: 200,
                data: {
                    ocppTagPk: 999,
                    idTag: 'test_rfid',
                    maxActiveTransactionCount: 0, // Should be 1 for unblocked
                    blocked: true, // Should be false for unblocked
                },
            });
            await expect(unblockSteveUser(fullQualifiedUser)).rejects.toThrow(SystemError);
            await unblockSteveUser(fullQualifiedUser).catch(err => {
                expect(err.errorDef.code).toBe(ErrorCodes.STEVE.USER_UNBLOCK_FAILED.code);
            });
        });

        it('should unblock user successfully (without reason)', async () => {
            steveAxios.put.mockResolvedValueOnce({
                status: 200,
                data: {
                    ocppTagPk: 999,
                    idTag: 'test_rfid',
                    maxActiveTransactionCount: 1,
                    blocked: false,
                },
            });
            await unblockSteveUser(fullQualifiedUser);
            expect(steveAxios.put).toHaveBeenCalledWith(
                `${STEVE_CONFIG.OCPP_TAGS_URI}/${fullQualifiedUser.steve_id}`,
                {
                    idTag: fullQualifiedUser.rfid,
                    maxActiveTransactionCount: 1,
                },
            );
            expect(db.recordActivityLog).toHaveBeenCalledWith(
                fullQualifiedUser.user_id,
                'UNBLOCK USER',
                'SteVe',
                fullQualifiedUser.rfid,
                null // reason
            );
        });

        it('should unblock user successfully (with reason)', async () => {
            steveAxios.put.mockResolvedValueOnce({
                status: 200,
                data: {
                    ocppTagPk: 999,
                    idTag: 'test_rfid',
                    maxActiveTransactionCount: 1,
                    blocked: false,
                },
            });
            const reason = "User has resolved the issue";
            await unblockSteveUser(fullQualifiedUser, reason);
            expect(steveAxios.put).toHaveBeenCalledWith(
                `${STEVE_CONFIG.OCPP_TAGS_URI}/${fullQualifiedUser.steve_id}`,
                {
                    idTag: fullQualifiedUser.rfid,
                    maxActiveTransactionCount: 1,
                },
            );
            expect(db.recordActivityLog).toHaveBeenCalledWith(
                fullQualifiedUser.user_id,
                'UNBLOCK USER',
                'SteVe',
                fullQualifiedUser.rfid,
                reason
            );
        });
    });
});
