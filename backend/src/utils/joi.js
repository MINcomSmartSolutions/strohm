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
    startValue: Joi.string().required(),
    // The meter value reading at the end of the transaction
    stopValue: Joi.string().allow(null),
    // The reason for the transaction being stopped
    stopReason: Joi.string().allow(null),
    // The actor who stopped the transaction
    stopEventActor: Joi.string().valid('station', 'manual').allow(null),
}).custom((obj, helpers) => {
    if (obj.stopValue !== null && Number(obj.startValue) > Number(obj.stopValue)) {
        return helpers.error('any.invalid');
    }
    return obj;
}, 'startValue <= stopValue validation');


module.exports = {
    userSchema,
    fullyQualifiedUserSchema,
    steveUserSchema,
    steveTransactionSchema,
};