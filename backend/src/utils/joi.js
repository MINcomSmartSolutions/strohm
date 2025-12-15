'use strict';
/**
 * @file Joi validation schemas
 */
const Joi = require('joi');
const {ValidationError, ErrorCodes} = require("./errors");

const userSchema = Joi.object({
    user_id: Joi.number().positive().required(),
    name: Joi.string().allow(null, ''),
    email: Joi.string().email().required(),
    odoo_user_id: Joi.number().allow(null),
    oauth_id: Joi.string().required(),
    rfid: Joi.string().required(),
    steve_id: Joi.number().allow(null),
}).unknown(true); // Allow additional fields


const oidcUserSchema = Joi.object({
    sub: Joi.string().required(),
    name: Joi.string().required(),
    email: Joi.string().email().required(),
    hmMifareSerial: Joi.string().allow(null, ''),
    eduPersonScopedAffiliation: Joi.array().items(Joi.string()).allow(null),
}).unknown(true); // Allow additional fields


const fullyQualifiedUserSchema = Joi.object({
    user_id: Joi.number().integer().required(),
    name: Joi.string().max(255).required(),
    email: Joi.string().email().required(),
    odoo_user_id: Joi.number().integer().required(),
    odoo_partner_id: Joi.number().integer().required(),
    oauth_id: Joi.string().required(),
    rfid: Joi.string().required(),
    steve_id: Joi.number().integer().required(),
}).unknown(true); // Allow additional fields


const steveUserSchema = Joi.object({
    //PK of the OCPP tag
    ocppTagPk: Joi.number().integer().required(),
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

// more flexible schema 
const steveTransactionSchema = Joi.object({
    // PK of the transaction
    id: Joi.number().integer().positive().required(),
    // Connector ID of the charge box at which the transaction took place
    connectorId: Joi.number().integer().positive().allow(null),
    // PK of the charge box at which the transaction took place
    chargeBoxPk: Joi.number().integer().positive().allow(null),
    // PK of the OCPP tag used in the transaction
    ocppTagPk: Joi.number().integer().positive().required(),
    // The identifier of the charge box at which the transaction took place
    chargeBoxId: Joi.string().allow(null),
    // The Ocpp Tag used in the transaction
    ocppIdTag: Joi.string().required(),
    // The timestamp at which the transaction started
    startTimestamp: Joi.date().required(),
    // The timestamp at which the transaction ended
    stopTimestamp: Joi.date().allow(null),
    // The meter value reading at the start of the transaction
    startValue: Joi.number().required(),
    // The meter value reading at the end of the transaction
    stopValue: Joi.number().allow(null),
    // The reason for the transaction being stopped
    stopReason: Joi.string().allow(null),
    // The actor who stopped the transaction
    stopEventActor: Joi.string().allow(null),
}).unknown(true); // Allow additional fields

const steveCompletedTransactionSchema = Joi.object({
    // PK of the transaction
    id: Joi.number().integer().positive().required(),
    // Connector ID of the charge box at which the transaction took place
    connectorId: Joi.number().integer().positive().allow(null),
    // PK of the charge box at which the transaction took place
    chargeBoxPk: Joi.number().integer().positive().allow(null),
    // PK of the OCPP tag used in the transaction
    ocppTagPk: Joi.number().integer().positive().required(),
    // The identifier of the charge box at which the transaction took place
    chargeBoxId: Joi.string().allow(null),
    // The Ocpp Tag used in the transaction
    ocppIdTag: Joi.string().required(),
    // The timestamp at which the transaction started
    startTimestamp: Joi.date().required(),
    // The timestamp at which the transaction ended
    stopTimestamp: Joi.date().required(),
    // The meter value reading at the start of the transaction
    startValue: Joi.number().required(),
    // The meter value reading at the end of the transaction
    stopValue: Joi.number().min(Joi.ref('startValue')).required(),
    // The reason for the transaction being stopped
    stopReason: Joi.string().required(),
    // The actor who stopped the transaction
    stopEventActor: Joi.string().allow(null),
}).unknown(true); // Allow additional fields


const qualifiedTransactionSchema = Joi.object({
    id: Joi.number().integer().positive().required(),
    created_at: Joi.date().required(),
    start_timestamp: Joi.date().required(),
    stop_timestamp: Joi.date().greater(Joi.ref('start_timestamp')).required(),
    start_value: Joi.number().min(0).required(),
    stop_value: Joi.number().min(Joi.ref('start_value')).required(),
    delivered_energy_wh: Joi.number().min(0).required(),
    ocpp_id_tag: Joi.string().required(),
}).unknown(true);

const validateUser = (user) => {
    const {error} = fullyQualifiedUserSchema.validate(user);
    if (error) {
        throw new ValidationError(ErrorCodes.VALIDATION.INVALID_FORMAT, `Invalid user ${error.message}`, error);
    }
};

module.exports = {
    userSchema,
    oidcUserSchema,
    fullyQualifiedUserSchema,
    steveUserSchema,
    steveTransactionSchema,
    qualifiedTransactionSchema,
    steveCompletedTransactionSchema,
    validateUser,
};