const {
    generateOdooHash,
    generateSalt,
    validateOIDCProperties,
} = require('#helpers/auth');
const crypto = require('crypto');


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

});