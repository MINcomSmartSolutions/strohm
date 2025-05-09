/**
 * @file Joi validation schemas
 */
const Joi = require('joi');

const userSchema = Joi.object({
    user_id: Joi.number().positive().required(),
    name: Joi.string().required(),
    email: Joi.string().email().required(),
    odoo_user_id: Joi.number().allow(null),
    oauth_id: Joi.string().required(),
    rfid: Joi.string().required(),
    steve_id: Joi.number().allow(null),
});

const fullyQualifiedUserSchema = Joi.object({
    user_id: Joi.number().positive().required(),
    name: Joi.string().required(),
    email: Joi.string().email().required(),
    odoo_user_id: Joi.number().required(),
    partner_id: Joi.number().required(),
    oauth_id: Joi.string().required(),
    rfid: Joi.string().required(),
    steve_id: Joi.number().required(),
});

const steveUserSchema = Joi.object({
    //PK of the OCPP tag
    ocppTagPk: Joi.number().positive().required(),
    //The OCPP tag (for example, RFID)
    idTag: Joi.string().required(),
    //Has the OCPP tag active transactions (i.e. ongoing charging sessions)?
    inTransaction: Joi.boolean(),
    //Is the OCPP tag blocked?
    blocked: Joi.boolean().required(),
    //The maximum number of active transactions allowed for this OCPP tag
    maxActiveTransactionCount: Joi.number().required(),
    // Optional fields
    //The date/time at which the OCPP tag will expire (if set)
    expiryDate: Joi.date().allow(null),
    //The number of currently active transactions for this OCPP tag
    activeTransactionCount: Joi.number().allow(null),
    //An additional note
    note: Joi.string().allow(null, ''),
}).unknown(true); // Allow additional fields


module.exports = {
    userSchema,
    fullyQualifiedUserSchema,
    steveResponseSchema,
    steveUserSchema,
};