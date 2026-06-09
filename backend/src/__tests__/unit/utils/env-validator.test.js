'use strict';

const {validateEnv} = require('../../../utils/env-validator');

describe('Environment Variable Validation', () => {
    let originalEnv;

    beforeEach(() => {
        // Store original environment
        originalEnv = {...process.env};
    });

    afterEach(() => {
        // Restore original environment
        process.env = originalEnv;
    });

    const validEnv = {
        NODE_ENV: 'dev',
        SERVER_PORT: '3000',
        SESSION_SECRET: 'this-is-a-very-long-secret-key-for-testing-purposes-123',

        // OIDC
        SERVER_OIDC_SECRET: 'oidc-secret',
        SERVER_OIDC_CLIENT_ID: 'client-id',
        SERVER_OIDC_ISSUER_BASE_URL: 'https://idp.example.com',
        SERVER_OIDC_BASE_URL: 'http://localhost:3000',
        SERVER_OIDC_CLIENT_SECRET: 'client-secret',

        // ODOO
        ODOO_API_SECRET: 'odoo-api-secret',
        ODOO_HOST: 'odoo',
        ODOO_PORT: '8069',
        ODOO_EXTERNAL_BASE_URL: 'https://odoo.example.com',
        WEBHOOK_API_KEY: 'webhook-key',

        // Database
        STROHM_DB_HOST: 'localhost',
        STROHM_DB_NAME: 'strohm',
        STROHM_DB_USER: 'strohm_admin',
        STROHM_DB_PASSWORD: 'db-password',
        STROHM_DB_PORT: '5432',

        // SteVe
        STEVE_BASE_URL: 'http://steve.example.com',
        STEVE_AUTH_USERNAME: 'admin',
        STEVE_API_PASSWORD: 'api-password',
        STEVE_FETCH_INTERVAL: '120',
    };

    test('should pass with all valid environment variables', () => {
        process.env = {...validEnv};
        expect(() => validateEnv()).not.toThrow();
    });

    test('should fail when SESSION_SECRET is missing', () => {
        process.env = {...validEnv};
        delete process.env.SESSION_SECRET;
        expect(() => validateEnv()).toThrow('Environment variable validation failed');
    });

    test('should fail when SESSION_SECRET is too short', () => {
        process.env = {...validEnv, SESSION_SECRET: 'short'};
        expect(() => validateEnv()).toThrow('Environment variable validation failed');
    });

    test('should fail when SERVER_OIDC_ISSUER_BASE_URL is not a valid URI', () => {
        process.env = {...validEnv, SERVER_OIDC_ISSUER_BASE_URL: 'not-a-uri'};
        expect(() => validateEnv()).toThrow('Environment variable validation failed');
    });

    test('should fail when required ODOO variables is missing', () => {
        process.env = {...validEnv};
        delete process.env.ODOO_API_SECRET;
        expect(() => validateEnv()).toThrow('Environment variable validation failed');
    });

    test('should fail when required database password is missing', () => {
        process.env = {...validEnv};
        delete process.env.STROHM_DB_PASSWORD;
        expect(() => validateEnv()).toThrow('Environment variable validation failed');
    });

    test('should apply default values for optional variables', () => {
        process.env = {...validEnv};
        delete process.env.NODE_ENV;
        delete process.env.SERVER_PORT;
        delete process.env.ODOO_HOST;

        const result = validateEnv();
        expect(result.NODE_ENV).toBe('dev');
        expect(result.SERVER_PORT).toBe(3000);
        expect(result.ODOO_HOST).toBe('odoo');
    });

    test('should accept valid NODE_ENV values', () => {
        const validNodeEnvs = ['dev', 'production', 'test'];

        validNodeEnvs.forEach(env => {
            process.env = {...validEnv, NODE_ENV: env};
            expect(() => validateEnv()).not.toThrow();
        });
    });

    test('should fail with invalid NODE_ENV value', () => {
        process.env = {...validEnv, NODE_ENV: 'invalid'};
        expect(() => validateEnv()).toThrow('Environment variable validation failed');
    });

    test('should validate STEVE_FETCH_INTERVAL minimum value', () => {
        process.env = {...validEnv, STEVE_FETCH_INTERVAL: '5'};
        expect(() => validateEnv()).toThrow('Environment variable validation failed');
    });

    test('should validate port numbers are valid', () => {
        process.env = {...validEnv, SERVER_PORT: '99999'};
        expect(() => validateEnv()).toThrow('Environment variable validation failed');
    });

    describe('STEVE Configuration Validation', () => {

        test('should validate STEVE_BASE_URL is a valid URI', () => {
            process.env = {...validEnv};
            delete process.env.STEVE_HOST;
            process.env.STEVE_BASE_URL = 'not-a-valid-uri';
            expect(() => validateEnv()).toThrow('Environment variable validation failed');
        });

        test('should use default STEVE_AUTH_USERNAME and STEVE_API_PASSWORD', () => {
            process.env = {...validEnv};
            delete process.env.STEVE_AUTH_USERNAME;
            delete process.env.STEVE_API_PASSWORD;

            const result = validateEnv();
            expect(result.STEVE_AUTH_USERNAME).toBe('admin');
            expect(result.STEVE_API_PASSWORD).toBe('1234api');
        });
    });
});