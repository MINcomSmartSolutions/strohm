/**
 * @file Type definitions
 *
 * @module utils/typedef
 */

/**
 * @typedef {Object} User
 * @memberOf Users
 * @property {string} user_id - The user's ID
 * @property {string} name - The user's name
 * @property {string} email - The user's email
 * @property {number} odoo_user_id - The user's Odoo ID
 * @property {number} partner_id - The user's Odoo partner ID
 * @property {string} oauth_id - The OAuth ID
 * @property {string} rfid - The user's RFID
 * @property {number} steve_id - The user's OCPP tag primary key in SteVe
 */


/**
 * @typedef {Object} tx
 * @memberOf Transactions
 * @memberOf SteveTransactions
 * @property {number} id - PK of the transaction
 * @property {number} connectorId - Connector ID of the charge box at which the transaction took place
 * @property {number} chargeBoxPk - PK of the charge box at which the transaction took place
 * @property {number} ocppTagPk - PK of the OCPP tag used in the transaction
 * @property {string} chargeBoxId - The identifier of the charge box at which the transaction took place
 * @property {string} ocppIdTag - The Ocpp Tag used in the transaction
 * @property {Date} startTimestamp - The timestamp at which the transaction started
 * @property {Date|null} stopTimestamp - The timestamp at which the transaction ended
 * @property {string} startValue - The meter value reading at the start of the transaction
 * @property {string|null} stopValue - The meter value reading at the end of the transaction
 * @property {string|null} stopReason - The reason for the transaction being stopped
 * @property {'station'|'manual'|null} stopEventActor - The actor who stopped the transaction
 */


/**
 * @typedef {Object} db_txn
 * @memberOf Transactions
 * @property {number} id - PK of the transaction
 * @property {Date} created_at - The timestamp at which the transaction was created
 * @property {Date} start_timestamp - The timestamp at which the transaction started
 * @property {Date} stop_timestamp - The timestamp at which the transaction ended
 * @property {number} delivered_energy_wh - The amount of energy delivered during the transaction in watt-hours
 * @property {number} start_value - The meter value reading at the start of the transaction
 * @property {number} stop_value - The meter value reading at the end of the transaction
 * @property {string} stop_reason - The reason for the transaction being stopped
 * @property {string} stop_event_actor - The actor who stopped the transaction
 * @property {number} connector_id - Connector ID of the charge box at which the transaction took place
 * @property {number} chargebox_pk - PK of the charge box at which the transaction took place
 * @property {number} ocpp_tag_pk - PK of the OCPP tag used in the transaction
 * @property {number} ocpp_id_tag - The Ocpp Tag used in the transaction
 * @property {number} user_id - The user ID associated with the transaction.
 * @property {number} invoice_ref - The invoice reference associated with the transaction returned from Odoo.
 * @property {number} steve_id - PK of the transaction
 */