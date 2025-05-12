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