/**
 * @file Type definitions
 *
 * @module utils/typedef
 */

/**
 * @typedef {Object} User
 *
 * @property {number} user_id - The user's ID
 * @property {string} name - The user's name
 * @property {string} email - The user's email
 * @property {number} odoo_user_id - The user's Odoo ID
 * @property {number} odoo_partner_id - The user's Odoo partner ID
 * @property {string} oauth_id - The OAuth ID
 * @property {string} rfid - The user's RFID
 * @property {number} steve_id - The user's OCPP tag primary key in SteVe
 * @property {Date} deactivated_at - The date and time when the user is (if any) deactivated
 */


/**
 * @typedef {Object} OIDCUser
 *
 * @property {string} sub - The subject (unique identifier) of the user
 * @property {string} name - The name of the user
 * @property {string} email - The email of the user
 * @property {string} [hmMifareSerial] - The HM Mifare Serial (RFID) of the user (optional yet in the beta)
 * @property {string} [preferred_username] - The preferred username of the user
 * @property {string} [given_name] - The given name of the user
 * @property {string} [family_name] - The family name of the user
 */


/**
 * @typedef {Object} steve_user
 *
 * @property {number} ocppTagPk - PK of the OCPP tag
 * @property {string} idTag - The OCPP tag (for example, RFID)
 * @property {boolean|null} inTransaction - Whether the OCPP tag has active transactions
 * @property {boolean} blocked - Whether the OCPP tag is blocked
 * @property {number} maxActiveTransactionCount - Maximum allowed concurrent transactions for this tag
 * @property {Date|null} expiryDate - Date/time at which the OCPP tag will expire (optional)
 * @property {number|null} activeTransactionCount - Current number of active transactions (optional)
 * @property {string|null} note - Additional note (optional)
 */


/**
 * @typedef {Object} steve_txn
 *
 * @property {number} id - PK of the transaction
 * @property {number} connectorId - Connector ID of the charge box at which the transaction took place
 * @property {number} chargeBoxPk - PK of the charge box at which the transaction took place
 * @property {number} ocppTagPk - PK of the OCPP tag used in the transaction
 * @property {string} chargeBoxId - The identifier of the charge box at which the transaction took place
 * @property {string} ocppIdTag - The Ocpp Tag used in the transaction
 * @property {Date} startTimestamp - The timestamp at which the transaction started
 * @property {Date|null} stopTimestamp - The timestamp at which the transaction ended
 * @property {string} startValue - The meter value reading at the start of the transactionin watt-hours
 * @property {string|null} stopValue - The meter value reading at the end of the transaction in watt-hours
 * @property {string|null} stopReason - The reason for the transaction being stopped
 * @property {'station'|'manual'|null} stopEventActor - The actor who stopped the transaction
 */


/**
 * @typedef {Object} db_txn
 *
 * @property {number} id - PK of the transaction in the database
 * @property {Date} created_at - The timestamp at which the transaction was created
 * @property {Date} start_timestamp - The timestamp at which the transaction started
 * @property {Date} stop_timestamp - The timestamp at which the transaction ended
 * @property {number} delivered_energy_wh - The amount of energy delivered during the transaction in watt-hours
 * @property {number} start_value - The meter value reading at the start of the transaction in watt-hours
 * @property {number} stop_value - The meter value reading at the end of the transaction in watt-hours
 * @property {string} stop_reason - The reason for the transaction being stopped
 * @property {string} stop_event_actor - The actor who stopped the transaction
 * @property {number} connector_id - Connector ID of the charge box at which the transaction took place
 * @property {number} chargebox_pk - PK of the charge box at which the transaction took place in SteVe
 * @property {number} ocpp_tag_pk - PK of the OCPP tag used in the transaction in SteVe (steve_id in strohm.users table)
 * @property {number} ocpp_id_tag - The Ocpp Tag used in the transaction (rfid in strohm.users table)
 * @property {number} user_id - The user ID associated with the transaction
 * @deprecated {number} invoice_ref - The invoice reference associated with the transaction returned from Odoo. Deprecated, use db_odoo_txn_order and db_odoo_invoice instead.
 * @property {number} txn_steve_id - PK of the transaction in SteVe
 */


/**
 * @typedef {Object} electricity_price
 *
 * @property {number} id - PK of the electricity price
 * @property {Date} created_at - The timestamp at which the electricity price was created
 * @property {Date} valid_from - The date from which the electricity price is valid
 * @property {Date} valid_till - The date until which the electricity price is valid
 * @property {number} price - The price as per kWh in cents
 */


/**
 * @typedef {Object} db_consent_revision
 *
 * @property {number} id - Unique identifier for the consent revision
 * @property {string} version - Version identifier (e.g., "1.0", "2.1.3")
 * @property {string} title - Human-readable title for the consent
 * @property {string} content - Full consent text content
 * @property {string|null} privacy_policy_url - URL to privacy policy (optional)
 * @property {string|null} terms_url - URL to terms of service (optional)
 * @property {Date} created_at - Timestamp when revision was created
 * @property {Date|null} expires_at - Expiration timestamp (null for no expiration)
 */


/**
 * @typedef {Object} db_user_consent
 *
 * @property {number} id - Unique identifier for the user consent record
 * @property {string} user_id - Identifier of the user who gave consent
 * @property {number} consent_revision_id - Identifier of the consent revision agreed to
 * @property {Date} consented_at - Timestamp when the user gave consent
 * @property {string} ip_address - IP address from which consent was given
 * @property {string|null} user_agent - User agent string of the browser/device (optional)
 * @property {string} consent_method - Method by which consent was obtained (e.g., "web", "mobile")
 * @property {boolean} is_withdrawn - Indicates if the user has withdrawn consent
 * @property {Date} withdrawn_at - Timestamp when consent was withdrawn (null if not withdrawn)
 * @property {Date} effective_from - Timestamp when the consent became effective
 * @property {Date} updated_at - Timestamp when the consent record was last updated
 */


/**
 * @typedef {Object} db_odoo_txn_order
 *
 * @property {number} id - Primary key for the order record
 * @property {number} txn_id - Foreign key linking to charging_transactions.id
 * @property {number|null} odoo_saleorder_id - The Odoo sale order ID
 * @property {string|null} odoo_saleorder_name - The Odoo sale order name (e.g., 'S00001')
 * @property {number|null} qty - Quantity of electricity delivered in kWh
 * @property {number|null} unit_price - Unit price per kWh in euros at the time of order creation
 * @property {number|null} total_amount - Total amount for the order (may include taxes and discounts)
 * @property {boolean} confirmed - Whether the order is confirmed (default: true)
 * @property {boolean} billed - Whether the order has been billed (default: false)
 * @property {boolean} cancelled - Whether the order is cancelled (default: false)
 * @property {Date} created_at - Timestamp when the order record was created
 */


/**
 * @typedef {Object} db_odoo_invoice
 *
 * @property {number} id - Primary key for the invoice record
 * @property {number} odoo_invoice_id - The Odoo invoice ID (unique)
 * @property {string|null} odoo_invoice_name - The Odoo invoice name (e.g., 'INV/2025/0001')
 * @property {number|null} total_amount - Total invoice amount (may include taxes and discounts)
 * @property {boolean} paid - Whether the invoice is paid (default: false)
 * @property {boolean} cancelled - Whether the invoice is cancelled (default: false)
 * @property {Date} created_at - Timestamp when the invoice record was created
 */


/**
 * @typedef {Object} db_odoo_order_invoice_link
 *
 * @property {number} id - Primary key for the link record
 * @property {number} order_id - Foreign key to odoo_txn_orders.id (unique - one order per invoice)
 * @property {number} invoice_id - Foreign key to odoo_invoices.id (one invoice can have multiple orders)
 * @property {Date} created_at - Timestamp when the link was created
 */

