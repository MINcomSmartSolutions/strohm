/**
 * @file Type definitions
 *
 * @module utils/typedef
 */

/**
 * @typedef {Object} User
 *
 * @property {string} user_id - The user's ID
 * @property {string} name - The user's name
 * @property {string} email - The user's email
 * @property {number} odoo_user_id - The user's Odoo ID
 * @property {number} partner_id - The user's Odoo partner ID
 * @property {string} oauth_id - The OAuth ID
 * @property {string} rfid - The user's RFID
 * @property {number} steve_id - The user's OCPP tag primary key in SteVe
 * @property {Date} deactivated_at - The date and time when the user is (if any) deactivated
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
 * @property {number} invoice_ref - The invoice reference associated with the transaction returned from Odoo
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