// Factory helpers for building sample objects for Joi schema tests
// Each function returns a valid baseline object that can be overridden via the overrides parameter.

const buildUser = (overrides = {}) => ({
    user_id: 1,
    name: 'Test User',
    email: 'test@example.com',
    odoo_user_id: 100,
    oauth_id: 'oauth123',
    rfid: 'rfid456',
    steve_id: 200,
    ...overrides,
});

const buildFullyQualifiedUser = (overrides = {}) => ({
    user_id: 1,
    name: 'Fully Qualified User',
    email: 'fq@example.com',
    odoo_user_id: 100,
    odoo_partner_id: 101,
    oauth_id: 'oauth123',
    rfid: 'rfid456',
    steve_id: 200,
    ...overrides,
});

const buildOidcUser = (overrides = {}) => ({
    sub: 'sub-123',
    name: 'OIDC User',
    email: 'oidc@example.com',
    hmMifareSerial: 'DEV-01000',
    ...overrides,
});

const nowIso = () => new Date().toISOString();

const buildSteveTransaction = (overrides = {}) => ({
    id: 1,
    connectorId: 1,
    chargeBoxPk: 100,
    ocppTagPk: 200,
    chargeBoxId: 'charger1',
    ocppIdTag: 'rfid123',
    startTimestamp: nowIso(),
    stopTimestamp: nowIso(),
    startValue: 0,
    stopValue: 10,
    stopReason: 'Remote',
    stopEventActor: 'manual',
    ...overrides,
});

const buildSteveCompletedTransaction = (overrides = {}) => ({
    id: 1,
    connectorId: 1,
    chargeBoxPk: 100,
    ocppTagPk: 200,
    chargeBoxId: 'charger1',
    ocppIdTag: 'rfid123',
    startTimestamp: nowIso(),
    stopTimestamp: nowIso(),
    startValue: 0,
    stopValue: 10,
    stopReason: 'Remote',
    stopEventActor: null,
    ...overrides,
});

const buildQualifiedTransaction = (overrides = {}) => {
    const startTime = new Date();
    const stopTime = new Date(startTime.getTime() + 3600000); // 1 hour later
    return {
        id: 1,
        created_at: startTime.toISOString(),
        start_timestamp: startTime.toISOString(),
        stop_timestamp: stopTime.toISOString(),
        start_value: 0,
        stop_value: 10,
        delivered_energy_wh: 10000,
        ocpp_id_tag: 'rfid123',
        ...overrides,
    };
};

module.exports = {
    buildUser,
    buildFullyQualifiedUser,
    buildOidcUser,
    buildSteveTransaction,
    buildSteveCompletedTransaction,
    buildQualifiedTransaction,
};

