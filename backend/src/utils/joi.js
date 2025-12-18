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


const odooTxnProcessResponseSchema = Joi.object({
    details: Joi.object({
        sale_order: Joi.object({
            id: Joi.number().integer().positive().required(),
            name: Joi.string(),
            confirmed: Joi.boolean(),
            total_amount: Joi.number().min(0),
            qty: Joi.number().min(0),
            line_count: Joi.number().integer().min(0),
        }).required(),
        invoice: Joi.object({
            id: Joi.number().integer().positive(),
            name: Joi.any(),
            state: Joi.string(),
            total_amount: Joi.number(),
        }),
    }).required(),
}).unknown(true);


const invoiceStateChangeEventSchema = Joi.object({
    invoice: Joi.object({
        // PK of the invoice
        id: Joi.number().integer().positive().required(),
        // Invoice reference number
        name: Joi.string().required(),
        // Invoice state (e.g., draft, posted)
        state: Joi.string().required(),
        // Type of move (e.g., out_invoice, in_invoice)
        move_type: Joi.string().required(),
        // Partner/Customer ID
        partner_id: Joi.number().integer().positive().required(),
        // Partner/Customer name
        partner_name: Joi.string(),
        // Total amount including tax
        amount_total: Joi.number().min(0).required(),
        // Amount before tax
        amount_untaxed: Joi.number().min(0).required(),
        // Tax amount
        amount_tax: Joi.number().min(0).required(),
        // Remaining amount to pay
        amount_residual: Joi.number().min(0).required(),
        // Currency ID
        currency_id: Joi.number().integer().positive().required(),
        // Currency code/name
        currency_name: Joi.string().required(),
        // Invoice date
        invoice_date: Joi.date(),
        // Due date
        invoice_date_due: Joi.date(),
        // Payment state (e.g., not_paid, paid, partial)
        payment_state: Joi.string().required(),
        // Related sale order IDs
        sale_order_ids: Joi.array().items(Joi.number().integer().positive()),
        // Related sale order names/references
        sale_order_names: Joi.array().items(Joi.string()),
        // Session backend references
        session_backend_refs: Joi.array().items(Joi.number().integer().positive()),
    }).unknown(true)
}).unknown(true); // Allow additional fields


const saleOrderStateChangeEventSchema = Joi.object({
    sale_order: Joi.object({
        // PK of the sale order
        id: Joi.number().integer().positive().required(),
        // Sale order reference number
        name: Joi.string().required(),
        // Sale order state (e.g., draft, sale, done, cancel)
        state: Joi.string().required(),
        // Invoice status (e.g., to invoice, invoiced, upselling)
        invoice_status: Joi.string().required(),
        // Partner/Customer ID
        partner_id: Joi.number().integer().positive().required(),
        // Partner/Customer name
        partner_name: Joi.string(),
        // Total amount including tax
        amount_total: Joi.number().min(0).required(),
        // Amount before tax
        amount_untaxed: Joi.number().min(0).required(),
        // Tax amount
        amount_tax: Joi.number().min(0).required(),
        // Currency ID
        currency_id: Joi.number().integer().positive().required(),
        // Currency code/name
        currency_name: Joi.string().required(),
        // Order date/time
        date_order: Joi.date().required(),
        // Related invoice IDs
        invoice_ids: Joi.array().items(Joi.any()).allow(null),
        // Related invoice names/references
        invoice_names: Joi.array().items(Joi.any()).allow(null),
        // Session backend references
        session_backend_refs: Joi.array().items(Joi.number().integer().positive()),
    }).unknown(true)
}).unknown(true); // Allow additional fields


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
    odooTxnProcessResponseSchema,
    invoiceStateChangeEventSchema,
    saleOrderStateChangeEventSchema,
    validateUser,
};