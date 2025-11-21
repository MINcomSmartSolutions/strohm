/**
 * @file Tests for Tailscale Authentication Middleware
 */

const {ensureTailscaleAccess, isIPInCIDR} = require('../../../middlewares/tailscaleAuth');
const {GLOBAL_CONFIG} = require('../../../config');

describe('Tailscale Authentication Middleware', () => {
    describe('isIPInCIDR', () => {
        it('should correctly identify IP in Tailscale range', () => {
            expect(isIPInCIDR('100.64.0.1', '100.64.0.0/10')).toBe(true);
            expect(isIPInCIDR('100.127.255.254', '100.64.0.0/10')).toBe(true);
        });

        it('should reject IP outside Tailscale range', () => {
            expect(isIPInCIDR('100.63.255.255', '100.64.0.0/10')).toBe(false);
            expect(isIPInCIDR('100.128.0.0', '100.64.0.0/10')).toBe(false);
            expect(isIPInCIDR('192.168.1.1', '100.64.0.0/10')).toBe(false);
        });

        it('should work with /32 (single IP)', () => {
            expect(isIPInCIDR('100.64.1.5', '100.64.1.5/32')).toBe(true);
            expect(isIPInCIDR('100.64.1.6', '100.64.1.5/32')).toBe(false);
        });

        it('should work with /16 range', () => {
            expect(isIPInCIDR('100.100.0.1', '100.100.0.0/16')).toBe(true);
            expect(isIPInCIDR('100.100.255.254', '100.100.0.0/16')).toBe(true);
            expect(isIPInCIDR('100.101.0.1', '100.100.0.0/16')).toBe(false);
        });
    });

    describe('ensureTailscaleAccess', () => {
        let req, res, next;
        let originalConfig;

        beforeEach(() => {
            req = {
                headers: {},
                connection: {}
            };
            res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };
            next = jest.fn();

            // Save original config
            originalConfig = {...GLOBAL_CONFIG.TAILSCALE};
        });

        afterEach(() => {
            // Restore original config
            GLOBAL_CONFIG.TAILSCALE = originalConfig;
        });

        it('should allow request from Tailscale IP in allowed range', () => {
            GLOBAL_CONFIG.TAILSCALE = {
                ALLOWED_RANGES: ['100.64.0.0/10'],
                ALLOWED_IPS: []
            };

            req.headers['x-real-ip'] = '100.64.1.5';

            ensureTailscaleAccess(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });

        it('should allow request from specific allowed IP', () => {
            GLOBAL_CONFIG.TAILSCALE = {
                ALLOWED_RANGES: [],
                ALLOWED_IPS: ['100.64.1.5']
            };

            req.headers['x-real-ip'] = '100.64.1.5';

            ensureTailscaleAccess(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });

        it('should deny request from non-Tailscale IP', () => {
            GLOBAL_CONFIG.TAILSCALE = {
                ALLOWED_RANGES: ['100.64.0.0/10'],
                ALLOWED_IPS: []
            };

            req.headers['x-real-ip'] = '203.0.113.42';

            ensureTailscaleAccess(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Access denied: Not from Tailscale network'
            });
        });

        it('should handle X-Forwarded-For header (first IP)', () => {
            GLOBAL_CONFIG.TAILSCALE = {
                ALLOWED_RANGES: ['100.64.0.0/10'],
                ALLOWED_IPS: []
            };

            req.headers['x-forwarded-for'] = '100.64.1.5, 192.168.1.1, 10.0.0.1';

            ensureTailscaleAccess(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });

        it('should handle IPv6-mapped IPv4 addresses', () => {
            GLOBAL_CONFIG.TAILSCALE = {
                ALLOWED_RANGES: ['100.64.0.0/10'],
                ALLOWED_IPS: []
            };

            req.headers['x-real-ip'] = '::ffff:100.64.1.5';

            ensureTailscaleAccess(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });

        it('should allow localhost in development mode with no config', () => {
            const originalEnv = GLOBAL_CONFIG.ENV.IS_PRODUCTION;
            GLOBAL_CONFIG.ENV.IS_PRODUCTION = false;
            GLOBAL_CONFIG.TAILSCALE = {
                ALLOWED_RANGES: [],
                ALLOWED_IPS: []
            };

            req.headers['x-real-ip'] = '127.0.0.1';

            ensureTailscaleAccess(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();

            GLOBAL_CONFIG.ENV.IS_PRODUCTION = originalEnv;
        });

        it('should deny request without headers in production', () => {
            const originalEnv = GLOBAL_CONFIG.ENV.IS_PRODUCTION;
            GLOBAL_CONFIG.ENV.IS_PRODUCTION = true;
            GLOBAL_CONFIG.TAILSCALE = {
                ALLOWED_RANGES: ['100.64.0.0/10'],
                ALLOWED_IPS: []
            };

            // No headers set
            req.connection.remoteAddress = undefined;

            ensureTailscaleAccess(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Access denied: Invalid request headers'
            });

            GLOBAL_CONFIG.ENV.IS_PRODUCTION = originalEnv;
        });

        it('should work with multiple allowed ranges', () => {
            GLOBAL_CONFIG.TAILSCALE = {
                ALLOWED_RANGES: ['100.64.0.0/10', '100.100.0.0/16'],
                ALLOWED_IPS: []
            };

            req.headers['x-real-ip'] = '100.100.1.5';

            ensureTailscaleAccess(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });

        it('should allow private Docker network IP in development mode when no Tailscale config', () => {
            const originalEnv = GLOBAL_CONFIG.ENV.IS_PRODUCTION;
            GLOBAL_CONFIG.ENV.IS_PRODUCTION = false;
            GLOBAL_CONFIG.TAILSCALE = {ALLOWED_RANGES: [], ALLOWED_IPS: []};

            req.headers['x-real-ip'] = '172.17.0.2'; // typical docker bridge IP

            ensureTailscaleAccess(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();

            GLOBAL_CONFIG.ENV.IS_PRODUCTION = originalEnv;
        });
    });
});
