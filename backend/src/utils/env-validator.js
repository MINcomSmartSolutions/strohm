'use strict';

/**
 * @file Environment variable validation
 * @module utils/env-validator
 *
 * Validates all required environment variables at startup to catch configuration issues early.
 */

const Joi = require('joi');

/**
 * Schema for environment variable validation
 */
const envSchema = Joi.object({
    // General
    NODE_ENV: Joi.string()
        .valid('dev', 'development', 'production', 'prod', 'test')
        .default('dev'),
    SERVER_PORT: Joi.number()
        .port()
        .default(3000),
    SESSION_SECRET: Joi.string()
        .min(32)
        .required()
        .messages({
            'string.min': 'SESSION_SECRET must be at least 32 characters long',
            'any.required': 'SESSION_SECRET is required'
        }),
    LOG_LEVEL: Joi.string()
        .valid('error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly')
        .default('info'),

    // OIDC Configuration
    SERVER_OIDC_SECRET: Joi.string()
        .required()
        .messages({'any.required': 'SERVER_OIDC_SECRET is required'}),
    SERVER_OIDC_CLIENT_ID: Joi.string()
        .required()
        .messages({'any.required': 'SERVER_OIDC_CLIENT_ID is required'}),
    SERVER_OIDC_ISSUER_BASE_URL: Joi.string()
        .uri()
        .required()
        .messages({
            'string.uri': 'SERVER_OIDC_ISSUER_BASE_URL must be a valid URI',
            'any.required': 'SERVER_OIDC_ISSUER_BASE_URL is required'
        }),
    SERVER_OIDC_BASE_URL: Joi.string()
        .uri()
        .required()
        .messages({
            'string.uri': 'SERVER_OIDC_BASE_URL must be a valid URI',
            'any.required': 'SERVER_OIDC_BASE_URL is required'
        }),
    SERVER_OIDC_CLIENT_SECRET: Joi.string()
        .required()
        .messages({'any.required': 'SERVER_OIDC_CLIENT_SECRET is required'}),

    // ODOO Configuration
    ODOO_ADMIN_API_KEY: Joi.string()
        .required()
        .messages({'any.required': 'ODOO_ADMIN_API_KEY is required'}),
    ODOO_API_SECRET: Joi.string()
        .required()
        .messages({'any.required': 'ODOO_API_SECRET is required'}),
    ODOO_HOST: Joi.string()
        .default('odoo'),
    ODOO_PORT: Joi.number()
        .port()
        .default(8069),
    ODOO_EXTERNAL_BASE_URL: Joi.string()
        .uri()
        .required()
        .messages({
            'string.uri': 'ODOO_EXTERNAL_BASE_URL must be a valid URI',
            'any.required': 'ODOO_EXTERNAL_BASE_URL is required'
        }),
    WEBHOOK_API_KEY: Joi.string()
        .required()
        .messages({'any.required': 'WEBHOOK_API_KEY is required'}),

    // Database (PostgreSQL)
    STROHM_DB_HOST: Joi.string()
        .required()
        .messages({'any.required': 'STROHM_DB_HOST is required'}),
    STROHM_DB_NAME: Joi.string()
        .default('strohm'),
    STROHM_DB_USER: Joi.string()
        .default('strohm_admin'),
    STROHM_DB_PASSWORD: Joi.string()
        .required()
        .messages({'any.required': 'STROHM_DB_PASSWORD is required'}),
    STROHM_DB_PORT: Joi.number()
        .port()
        .default(5432),

    // SteVe Configuration
    STEVE_HOST: Joi.string()
        .when('STEVE_BASE_URL', {
            is: Joi.exist(),
            then: Joi.optional(),
            otherwise: Joi.required().messages({
                'any.required': 'STEVE_HOST is required when STEVE_BASE_URL is not provided'
            })
        })
        .default('steve'),
    STEVE_PORT: Joi.number()
        .port()
        .when('STEVE_BASE_URL', {
            is: Joi.exist(),
            then: Joi.optional(),
            otherwise: Joi.required().messages({
                'any.required': 'STEVE_PORT is required when STEVE_BASE_URL is not provided'
            })
        })
        .default(8180),
    STEVE_BASE_URL: Joi.string()
        .uri()
        .when('STEVE_HOST', {
            is: Joi.exist(),
            then: Joi.optional(),
            otherwise: Joi.required().messages({
                'any.required': 'STEVE_BASE_URL is required when STEVE_HOST is not provided'
            })
        }),
    STEVE_AUTH_USERNAME: Joi.string()
        .default('admin'),
    STEVE_API_PASSWORD: Joi.string()
        .default('1234api'),
    STEVE_FETCH_INTERVAL: Joi.number()
        .integer()
        .min(10)
        .default(120)
        .messages({
            'number.min': 'STEVE_FETCH_INTERVAL must be at least 10 seconds'
        }),
}).unknown(true); // Allow other environment variables

/**
 * Validates environment variables against the schema
 * @throws {Error} If validation fails
 * @returns {Object} Validated and sanitized environment variables
 */
function validateEnv() {
    const {error, value} = envSchema.validate(process.env, {
        abortEarly: false, // Collect all errors, not just the first one
        stripUnknown: false, // Keep unknown environment variables
    });

    if (error) {
        const errorMessages = error.details.map(detail => {
            return `  - ${detail.message}`;
        }).join('\n');

        console.error('\n Environment variable validation failed:\n');
        console.error(errorMessages);
        console.error('\n Please check your .env file and ensure all required variables are set.\n');
        console.error(' Refer to README.md for the complete list of required environment variables.\n');

        throw new Error('Environment variable validation failed');
    }

    console.log(' Environment variables validated successfully');
    return value;
}

/**
 * Validates environment variables and exits process if validation fails
 * Call this at the very beginning of your application
 */
function validateEnvOrExit() {
    try {
        return validateEnv();
    } catch (error) {
        process.exit(1);
    }
}

module.exports = {
    validateEnv,
    validateEnvOrExit,
};

