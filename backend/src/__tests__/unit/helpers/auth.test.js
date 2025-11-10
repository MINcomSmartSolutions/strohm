const {
    generateOdooHash,
    generateSalt,
    validateOIDCProperties,
    hasEmployeeAffiliation,
} = require('#helpers/auth');
const crypto = require('crypto');
const logger = require('#services/logger');

jest.mock('#services/logger', () => ({
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    verbose: jest.fn(),
}));


describe('Auth Helper Functions', () => {
    describe('Generate Salt', () => {
        it('should generate a salt of specified byted length', () => {
            const randomLength = Math.floor(Math.random() * 100) + 1;
            const salt = generateSalt(randomLength);
            expect(salt).toHaveLength(Math.ceil((randomLength / 3) * 4)); // base64url encoding increases size
        });

        it('should generate a salt of default byted length when no length is provided', () => {
            const defaultLength = 16;

            const salt = generateSalt();
            expect(salt).toHaveLength(Math.ceil((defaultLength / 3) * 4)); // base64url encoding increases size
        });

        it('should generate different salts on subsequent calls', () => {
            const salt1 = generateSalt();
            const salt2 = generateSalt();
            expect(salt1).not.toBe(salt2);
        });

        it('should throw an error if provided length is not a positive integer', () => {
            expect(() => generateSalt(-5)).toThrow();
            expect(() => generateSalt(0)).toThrow();
            expect(() => generateSalt(3.5)).toThrow();
            expect(() => generateSalt('string')).toThrow();
        });
    });

    describe('Generate Odoo Hash', () => {
        it('should produce a deterministic sha256 hmac hex digest matching manual crypto', () => {
            const message = 'The quick brown fox';
            const secret = 's3cr3t';
            const expected = crypto.createHmac('sha256', secret).update(message, 'utf8').digest('hex');
            const actual = generateOdooHash(message, secret);
            expect(actual).toBe(expected);
        });

        it('should throw on invalid parameters', () => {
            expect(() => generateOdooHash('', 'secret')).toThrow();
            expect(() => generateOdooHash('message', '')).toThrow();
            expect(() => generateOdooHash(null, 'secret')).toThrow();
            expect(() => generateOdooHash('message', null)).toThrow();
        });
    });

    describe('Validate OIDC Properties', () => {
        it('returns false when request is missing', async () => {
            const result = await validateOIDCProperties(null);
            expect(result).toBe(false);
        });

        it('returns false when not authenticated', async () => {
            const req = {oidc: {isAuthenticated: () => false}};
            const result = await validateOIDCProperties(req);
            expect(result).toBe(false);
        });

        it('returns false when access token missing access_token property', async () => {
            const req = {
                oidc: {
                    isAuthenticated: () => true,
                    accessToken: {isExpired: () => false, access_token: undefined},
                    user: {sub: 'user123'},
                },
            };
            const result = await validateOIDCProperties(req);
            expect(result).toBe(false);
        });

        it('returns false when user object missing', async () => {
            const req = {
                oidc: {
                    isAuthenticated: () => true,
                    accessToken: {isExpired: () => false, access_token: 'token'},
                    user: null,
                },
            };
            const result = await validateOIDCProperties(req);
            expect(result).toBe(false);
        });

        it('refreshes expired token and returns true when all properties present', async () => {
            const refreshed = {access_token: 'refreshed-token', isExpired: () => false};
            const refreshFn = jest.fn(async () => refreshed);

            const req = {
                oidc: {
                    isAuthenticated: () => true,
                    accessToken: {isExpired: () => true, refresh: refreshFn},
                    user: {sub: 'user123'},
                },
            };

            const result = await validateOIDCProperties(req);
            expect(refreshFn).toHaveBeenCalled();
            expect(result).toBe(true);
        });

        it('returns true when token is not expired and access_token present', async () => {
            const req = {
                oidc: {
                    isAuthenticated: () => true,
                    accessToken: {isExpired: () => false, access_token: 'token'},
                    user: {sub: 'user123'},
                },
            };
            const result = await validateOIDCProperties(req);
            expect(result).toBe(true);
        });
    });

    describe('hasEmployeeAffiliation', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        it('should return true when user has employee@hm.edu affiliation', () => {
            const oidcUser = {
                sub: 'user123',
                eduPersonScopedAffiliation: ['employee@hm.edu'],
            };

            const result = hasEmployeeAffiliation(oidcUser);

            expect(result).toBe(true);
            expect(logger.debug).toHaveBeenCalledWith(
                'User user123 has employee@hm.edu affiliation'
            );
        });

        it('should return true when user has employee@hm.edu along with other affiliations', () => {
            const oidcUser = {
                sub: 'user456',
                eduPersonScopedAffiliation: ['student@hm.edu', 'employee@hm.edu', 'member@hm.edu'],
            };

            const result = hasEmployeeAffiliation(oidcUser);

            expect(result).toBe(true);
            expect(logger.debug).toHaveBeenCalledWith(
                'User user456 has employee@hm.edu affiliation'
            );
        });

        it('should return false when user does not have employee@hm.edu affiliation', () => {
            const oidcUser = {
                sub: 'user789',
                eduPersonScopedAffiliation: ['student@hm.edu', 'member@hm.edu'],
            };

            const result = hasEmployeeAffiliation(oidcUser);

            expect(result).toBe(false);
            expect(logger.debug).toHaveBeenCalledWith(
                'User user789 does not have employee@hm.edu affiliation. Affiliations: student@hm.edu, member@hm.edu'
            );
        });

        it('should return false when eduPersonScopedAffiliation is an empty array', () => {
            const oidcUser = {
                sub: 'user101',
                eduPersonScopedAffiliation: [],
            };

            const result = hasEmployeeAffiliation(oidcUser);

            expect(result).toBe(false);
            expect(logger.debug).toHaveBeenCalledWith(
                'User user101 does not have employee@hm.edu affiliation. Affiliations: '
            );
        });

        it('should return false when eduPersonScopedAffiliation is not an array', () => {
            const oidcUser = {
                sub: 'user202',
                eduPersonScopedAffiliation: 'employee@hm.edu',
            };

            const result = hasEmployeeAffiliation(oidcUser);

            expect(result).toBe(false);
            expect(logger.debug).toHaveBeenCalledWith(
                'User user202 has no eduPersonScopedAffiliation array'
            );
        });

        it('should return false when eduPersonScopedAffiliation is null', () => {
            const oidcUser = {
                sub: 'user303',
                eduPersonScopedAffiliation: null,
            };

            const result = hasEmployeeAffiliation(oidcUser);

            expect(result).toBe(false);
            expect(logger.debug).toHaveBeenCalledWith(
                'User user303 has no eduPersonScopedAffiliation array'
            );
        });

        it('should return false when eduPersonScopedAffiliation is undefined', () => {
            const oidcUser = {
                sub: 'user404',
            };

            const result = hasEmployeeAffiliation(oidcUser);

            expect(result).toBe(false);
            expect(logger.debug).toHaveBeenCalledWith(
                'User user404 has no eduPersonScopedAffiliation array'
            );
        });

        it('should return false when oidcUser is null', () => {
            const result = hasEmployeeAffiliation(null);

            expect(result).toBe(false);
            expect(logger.warn).toHaveBeenCalledWith(
                'OIDC user object is missing in affiliation check'
            );
        });

        it('should return false when oidcUser is undefined', () => {
            const result = hasEmployeeAffiliation(undefined);

            expect(result).toBe(false);
            expect(logger.warn).toHaveBeenCalledWith(
                'OIDC user object is missing in affiliation check'
            );
        });

        it('should be case-sensitive and not match EMPLOYEE@hm.edu', () => {
            const oidcUser = {
                sub: 'user505',
                eduPersonScopedAffiliation: ['EMPLOYEE@hm.edu', 'student@hm.edu'],
            };

            const result = hasEmployeeAffiliation(oidcUser);

            expect(result).toBe(false);
            expect(logger.debug).toHaveBeenCalledWith(
                'User user505 does not have employee@hm.edu affiliation. Affiliations: EMPLOYEE@hm.edu, student@hm.edu'
            );
        });

        it('should not match partial strings like employee@hm.edu.de', () => {
            const oidcUser = {
                sub: 'user606',
                eduPersonScopedAffiliation: ['employee@hm.edu.de', 'staff@hm.edu'],
            };

            const result = hasEmployeeAffiliation(oidcUser);

            expect(result).toBe(false);
            expect(logger.debug).toHaveBeenCalledWith(
                'User user606 does not have employee@hm.edu affiliation. Affiliations: employee@hm.edu.de, staff@hm.edu'
            );
        });
    });

});

