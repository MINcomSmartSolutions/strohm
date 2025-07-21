'use strict'
/**
 * @file SCIM Controller
 * Handles SCIM protocol operations for user management.
 * Supports CRUD operations for users, including validation and error handling.
 *
 */

const express = require('express');
const scim_controller = express.Router();
const SCIMMY = require("scimmy");
const logger = require('../services/logger');
const {db} = require('../utils/queries');
const {userOperations} = require('../services/user_operations');
const {AuthError, ValidationError, ErrorCodes} = require('../utils/errors');
const Joi = require('joi');
const {blockSteveUser} = require("../services/steve_user");
const {scimAuth} = require('../middlewares/auth');


// Apply SCIM authentication middleware to all SCIM routes
scim_controller.use('/scim/v2', scimAuth);

// SCIM Joi Validation Schemas
const scimUserPatchSchema = Joi.object({
    schemas: Joi.array().items(Joi.string()).optional(),
    userName: Joi.string().email().max(255).optional(),
    name: Joi.object({
        givenName: Joi.string().max(50).allow('').optional(),
        familyName: Joi.string().max(50).allow('').optional(),
        formatted: Joi.string().max(100).allow('').optional()
    }).optional(),
    emails: Joi.array().items(
        Joi.object({
            value: Joi.string().email().required(),
            primary: Joi.boolean().optional(),
            type: Joi.string().valid('work', 'home', 'other').optional()
        })
    ).max(5).optional(), // Limit to 5 emails
}).unknown(false) // Reject any fields not defined above
    .messages({
        'object.unknown': 'Field {#label} is not allowed. Allowed fields: userName, name, emails, rfid'
    });

const scimUserCreateSchema = Joi.object({
    schemas: Joi.array().items(Joi.string()).optional(),
    userName: Joi.string().email().max(255).required(),
    name: Joi.object({
        givenName: Joi.string().max(100).allow('').optional(),
        familyName: Joi.string().max(100).allow('').optional(),
        formatted: Joi.string().max(200).allow('').optional()
    }).optional(),
    emails: Joi.array().items(
        Joi.object({
            value: Joi.string().email().required(),
            primary: Joi.boolean().optional(),
            type: Joi.string().valid('work', 'home', 'other').optional()
        })
    ).min(1).max(5).required(),
    active: Joi.boolean().default(true).optional(),
    externalId: Joi.string().max(255).optional()
}).unknown(false);

/**
 * Validate SCIM resource using Joi and throw appropriate errors
 * @param {Object} resource - Resource to validate
 * @param {Joi.Schema} schema - Joi schema to validate against
 * @param {string} operation - Operation name for error context
 */
const validateSCIMResource = (resource, schema, operation) => {
    const {error, value} = schema.validate(resource, {
        abortEarly: false,
        stripUnknown: false,
        convert: true
    });

    if (error) {
        const errorDetails = error.details.map(detail => detail.message).join('; ');
        logger.warn(`SCIM ${operation} validation failed:`, errorDetails);
        throw new ValidationError(
            ErrorCodes.VALIDATION.INVALID_PARAMETERS,
            `SCIM ${operation} validation failed: ${errorDetails}`
        );
    }

    return value; // Return sanitized/converted value
};

/**
 * SCIM User Resource Handler
 * Handles CRUD operations for users via SCIM protocol
 */
class SCIMUserHandler {
    /**
     * Retrieve users with optional filtering and pagination
     * @param {Object} request - SCIM request object
     * @returns {Promise<Object>} SCIM response with users
     */
    static async read(request) {
        try {
            const {filter, startIndex = 1, count = 100} = request;
            logger.info(`SCIM Users read request - Filter: ${filter}, StartIndex: ${startIndex}, Count: ${count}`);

            let users = [];
            let totalResults = 0;

            if (filter) {
                // Parse simple filters (e.g., userName eq "john@example.com")
                const filterMatch = filter.match(/(\w+)\s+(eq|ne|sw|ew|co)\s+"([^"]+)"/i);
                if (filterMatch) {
                    const [, attribute, operator, value] = filterMatch;

                    if (attribute.toLowerCase() === 'username' && operator.toLowerCase() === 'eq') {
                        const user = await db.getUserUnique({email: value});
                        if (user) {
                            users = [user];
                            totalResults = 1;
                        }
                    } else if (attribute.toLowerCase() === 'id' && operator.toLowerCase() === 'eq') {
                        const user = await db.getUserUnique({oauth_id: value});
                        if (user) {
                            users = [user];
                            totalResults = 1;
                        }
                    }
                }
            } else {
                // Get all users with pagination
                const offset = Math.max(0, startIndex - 1);
                users = await db.getUsers({}, {limit: count, offset});
                totalResults = await db.getUsersCount();
            }

            // Convert database users to SCIM format
            const scimUsers = users.map(user => this.toSCIMUser(user));

            return {
                totalResults,
                startIndex,
                itemsPerPage: scimUsers.length,
                Resources: scimUsers
            };

        } catch (error) {
            logger.error('SCIM Users read error:', error);
            throw new ValidationError(ErrorCodes.SCIM.READ_ERROR, 'Failed to retrieve users');
        }
    }

    /**
     * NOT TESTED
     * Create a new user via SCIM. Should not be used since users are created via OIDC.
     * Does not trigger Odoo or SteVe user creation.
     * @param {Object} resource - SCIM user resource
     * @returns {Promise<Object>} Created SCIM user
     * @async
     */
    static async write(resource) {
        try {
            logger.info('SCIM User create request:', JSON.stringify(resource, null, 2));

            // Validate resource against SCIM schema
            const validResource = validateSCIMResource(resource, scimUserCreateSchema, 'CREATE');

            const {userName, name, emails} = validResource;

            const email = emails[0].value;
            const displayName = name ? `${name.givenName || ''} ${name.familyName || ''}`.trim() : userName;

            // Check if user already exists
            const existingUser = await db.getUserUnique({email});
            if (existingUser) {
                throw new ValidationError(ErrorCodes.USER.ALREADY_EXISTS);
            }

            // Create OIDC-like user object for userOperations
            const oidcUser = {
                sub: resource.externalId || `scim-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                name: displayName,
                email: email
            };

            // Use existing userOperations to create user with proper external system links
            const createdUser = await userOperations(oidcUser);

            return this.toSCIMUser(createdUser);

        } catch (error) {
            logger.error('SCIM User create error:', error);
            if (error instanceof ValidationError || error instanceof AuthError) {
                throw error;
            }
            throw new ValidationError(ErrorCodes.SCIM.CREATE_ERROR);
        }
    }

    /**
     * Update an existing user via SCIM
     * @param {string} id - User's Oauth ID
     * @param {Object} resource - SCIM user resource
     * @returns {Promise<Object>} Updated SCIM user
     * @async
     */
    static async patch(id, resource) {
        // TODO: This updates should also be reflected on steve(if rfid is changed) and other fields
        try {
            logger.info(`SCIM User patch request for ID: ${id}`, resource);

            const user = await db.getUserUnique({oauth_id: id});
            if (!user) {
                throw new ValidationError(ErrorCodes.USER.NOT_FOUND);
            }

            // Validate resource against SCIM schema
            const validResource = validateSCIMResource(resource, scimUserPatchSchema, 'PATCH');

            // Define allowed fields that can be updated via SCIM
            const allowedFields = [
                'userName',
                'name',
                'emails',
                // 'rfid'
            ];

            // Check for any disallowed fields in the resource
            const resourceKeys = Object.keys(validResource);
            const disallowedFields = resourceKeys.filter(key => !allowedFields.includes(key) && key !== 'schemas');

            if (disallowedFields.length > 0) {
                logger.warn(`SCIM PATCH attempted to modify disallowed fields: ${disallowedFields.join(', ')}`);
                throw new ValidationError(ErrorCodes.VALIDATION.INVALID_PARAMETERS,
                    `Cannot modify fields: ${disallowedFields.join(', ')}. Allowed fields: ${allowedFields.join(', ')}`
                );
            }

            const updates = {};

            // Only process allowed fields
            //FIXME: Username can be email or username?
            // This is error prone
            if (validResource.userName && typeof validResource.userName === 'string') {
                // Validate email format for userName
                updates.email = validResource.userName.toLowerCase().trim();
            }

            if (validResource.name && typeof validResource.name === 'object') {
                const nameValidation = Joi.object({
                    givenName: Joi.string().max(100).allow('').optional(),
                    familyName: Joi.string().max(100).allow('').optional(),
                    formatted: Joi.string().max(200).allow('').optional()
                }).validate(validResource.name);

                if (nameValidation.error) {
                    throw new ValidationError(
                        ErrorCodes.VALIDATION.INVALID_PARAMETERS,
                        `Name validation failed: ${nameValidation.error.details.map(d => d.message).join('; ')}`
                    );
                }

                const givenName = (validResource.name.givenName || '').trim();
                const familyName = (validResource.name.familyName || '').trim();

                updates.firstName = givenName;
                updates.lastName = familyName;
            }

            if (validResource.emails && Array.isArray(validResource.emails) && validResource.emails[0]) {
                const primaryEmail = validResource.emails[0];
                const emailSchema = Joi.string().email().required();
                const {error} = emailSchema.validate(primaryEmail.value);
                if (error) {
                    throw new ValidationError(ErrorCodes.VALIDATION.INVALID_EMAIL, 'Primary email must be a valid email address');
                }
                updates.email = primaryEmail.value.toLowerCase().trim();
            }

            // Prevent updates if no valid changes
            if (Object.keys(updates).length === 0) {
                logger.info(`No valid updates provided for user ${id}`);
                return this.toSCIMUser(user);
            }

            // Log what fields are being updated
            logger.info(`Updating user ${id} with fields: ${Object.keys(updates).join(', ')}`);

            // Update user in database
            await db.updateUser(user.user_id, updates);

            // Get updated user
            const updatedUser = await db.getUserUnique({oauth_id: id});
            return this.toSCIMUser(updatedUser);

        } catch (error) {
            logger.error('SCIM User patch error:', error);
            if (error instanceof ValidationError || error instanceof AuthError) {
                throw error;
            }
            throw new ValidationError(ErrorCodes.SCIM.UPDATE_ERROR);
        }
    }

    /**
     * Delete a user via SCIM
     * @param {string} id - User ID
     * @returns {Promise<void>}
     */
    static async delete(id) {
        try {
            logger.info(`SCIM User delete request for ID: ${id}`);

            const user = await db.getUserUnique({oauth_id: id});
            if (!user) {
                throw new ValidationError(ErrorCodes.USER.NOT_FOUND);
            }

            // Soft delete or deactivate user instead of hard delete
            // Essential
            await db.deactivateUser(user);

            // Secondary priority
            try {
                await db.revokeUserOdooCredentials(user);
                await blockSteveUser(user);
            } catch (error) {
                logger.error(`Failed to revoke Odoo credentials or block user in SteVe for user ${id}:`, error.message);
            }

            await db.recordActivityLog(user.user_id, "SOFT DELETE", "DB", user.rfid, "SCIM");
            logger.info(`User ${id} deactivated successfully`);

        } catch (error) {
            logger.error('SCIM User delete error:', error);
            if (error instanceof ValidationError || error instanceof AuthError) {
                throw error;
            }
            throw new ValidationError(ErrorCodes.SCIM.DELETE_ERROR);
        }
    }

    /**
     * Convert database user to SCIM user format
     * @param {Object} user - Database user object
     * @returns {Object} SCIM user object
     */
    static toSCIMUser(user) {
        const nameParts = (user.name || '').split(' ');
        const givenName = nameParts[0] || '';
        const familyName = nameParts.slice(1).join(' ') || '';

        return {
            id: user.oauth_id,
            externalId: user.oauth_id,
            userName: user.email,
            name: {
                givenName,
                familyName,
                formatted: user.name
            },
            emails: [
                {
                    value: user.email,
                    primary: true
                }
            ],
            active: user.deactivated_at === null,
            meta: {
                resourceType: 'User',
                created: user.created_at ? new Date(user.created_at).toISOString() : new Date().toISOString(),
                lastModified: user.updated_at ? new Date(user.updated_at).toISOString() : new Date().toISOString(),
                location: `${process.env.SCIM_BASE_URL || "/scim/v2"}/Users/${user.oauth_id}`
            }
        };
    }
}

// Register SCIM User Resource Type with correct SCIMMY API
SCIMMY.Resources.declare(SCIMMY.Resources.User)
    .ingress((resource, data) => {
        // Handle both create and update operations
        if (data && data.id) {
            // Update operation - data contains the existing resource
            return SCIMUserHandler.patch(data.id, resource);
        } else {
            // Create operation
            return SCIMUserHandler.write(resource);
        }
    })
    .egress((data) => {
        // Handle read operations
        return SCIMUserHandler.read(data || {});
    })
    .degress((data) => {
        // Handle delete operations
        if (data && data.id) {
            return SCIMUserHandler.delete(data.id);
        }
        throw new ValidationError(ErrorCodes.VALIDATION.MISSING_PARAMETERS, 'User ID required for delete operation',);
    });

/**
 * SCIM Error Handler Middleware
 */
const scimErrorHandler = (error, req, res, next) => {
    logger.error('SCIM Error:', error);

    let statusCode = 500;
    let scimError = {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        detail: 'Internal server error',
        status: '500'
    };

    if (error instanceof ValidationError) {
        statusCode = 400;
        scimError.detail = error.customMessage ? error.customMessage : error.errorDef.message;
        scimError.status = '400';
    } else if (error instanceof AuthError) {
        statusCode = 401;
        scimError.detail = error.customMessage ? error.customMessage : error.errorDef.message;
        scimError.status = '401';
    } else if (error.errorDef === 'User not found') {
        statusCode = 404;
        scimError.detail = 'User not found';
        scimError.status = '404';
    }

    res.status(statusCode).json(scimError);
};

// SCIM v2 Routes

// ServiceProviderConfig endpoint
scim_controller.get('/scim/v2/ServiceProviderConfig', (req, res) => {
    res.json({
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
        // The communication between us and IdP will be inside a VLAN and assumed to be secure.
        // For this reason we will not be implementing more complex authentication methods like oauthbearertoken or x509certificate
        // In any case these routes cannot be exposed outside of network TODO: Block here in nginx
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

// ResourceTypes endpoint
scim_controller.get('/scim/v2/ResourceTypes', (req, res) => {
    res.json({
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

// Schemas endpoint
scim_controller.get('/scim/v2/Schemas', (req, res) => {
    res.json({
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

// Users endpoints
scim_controller.get('/scim/v2/Users', async (req, res, next) => {
    try {
        const result = await SCIMUserHandler.read(req.query);
        res.json({
            schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
            ...result
        });
    } catch (error) {
        next(error);
    }
});

scim_controller.get('/scim/v2/Users/:id', async (req, res, next) => {
    try {
        const result = await SCIMUserHandler.read({filter: `id eq "${req.params.id}"`});
        if (result.totalResults === 0) {
            return res.status(404).json({
                schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
                detail: 'User not found',
                status: '404'
            });
        }
        res.json(result.Resources[0]);
    } catch (error) {
        next(error);
    }
});

scim_controller.post('/scim/v2/Users', async (req, res, next) => {
    try {
        const result = await SCIMUserHandler.write(req.body);
        res.status(201).json(result);
    } catch (error) {
        next(error);
    }
});

scim_controller.patch('/scim/v2/Users/:id', async (req, res, next) => {
    try {
        const result = await SCIMUserHandler.patch(req.params.id, req.body);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

scim_controller.delete('/scim/v2/Users/:id', async (req, res, next) => {
    try {
        await SCIMUserHandler.delete(req.params.id);
        res.status(204).send();
    } catch (error) {
        next(error);
    }
});

// Apply SCIM error handling
scim_controller.use(scimErrorHandler);

module.exports = scim_controller;
