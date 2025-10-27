const {
    userSchema,
    fullyQualifiedUserSchema,
    steveUserSchema,
    steveTransactionSchema,
    dbTransactionSchema,
} = require('#utils/joi');

describe('Joi Validation Schemas', () => {
    describe('userSchema', () => {
        it('should validate a valid user', () => {
            const validUser = {
                user_id: 1,
                name: 'Test User',
                email: 'test@example.com',
                odoo_user_id: 100,
                oauth_id: 'oauth123',
                rfid: 'rfid456',
                steve_id: 200,
            };

            const {error} = userSchema.validate(validUser);
            expect(error).toBeUndefined();
        });

        it('should allow null for name', () => {
            const userWithNullName = {
                user_id: 1,
                name: null,
                email: 'test@example.com',
                odoo_user_id: 100,
                oauth_id: 'oauth123',
                rfid: 'rfid456',
                steve_id: 200,
            };

            const {error} = userSchema.validate(userWithNullName);
            expect(error).toBeUndefined();
        });

        it('should allow empty string for name', () => {
            const userWithEmptyName = {
                user_id: 1,
                name: '',
                email: 'test@example.com',
                odoo_user_id: 100,
                oauth_id: 'oauth123',
                rfid: 'rfid456',
                steve_id: 200,
            };

            const {error} = userSchema.validate(userWithEmptyName);
            expect(error).toBeUndefined();
        });

        it('should reject invalid email', () => {
            const userWithInvalidEmail = {
                user_id: 1,
                name: 'Test User',
                email: 'invalid-email',
                odoo_user_id: 100,
                oauth_id: 'oauth123',
                rfid: 'rfid456',
                steve_id: 200,
            };

            const {error} = userSchema.validate(userWithInvalidEmail);
            expect(error).toBeDefined();
            expect(error.message).toContain('email');
        });

        it('should reject negative user_id', () => {
            const userWithNegativeId = {
                user_id: -1,
                name: 'Test User',
                email: 'test@example.com',
                odoo_user_id: 100,
                oauth_id: 'oauth123',
                rfid: 'rfid456',
                steve_id: 200,
            };

            const {error} = userSchema.validate(userWithNegativeId);
            expect(error).toBeDefined();
            expect(error.message).toContain('user_id');
        });
    });

    describe('fullyQualifiedUserSchema', () => {
        it('should validate a valid fully qualified user', () => {
            const validUser = {
                user_id: 1,
                name: 'Test User',
                email: 'test@example.com',
                odoo_user_id: 100,
                odoo_partner_id: 101,
                oauth_id: 'oauth123',
                rfid: 'rfid456',
                steve_id: 200,
            };

            const {error} = fullyQualifiedUserSchema.validate(validUser);
            expect(error).toBeUndefined();
        });

        it('should reject null values for required fields', () => {
            const invalidUser = {
                user_id: 1,
                name: 'Test User',
                email: 'test@example.com',
                odoo_user_id: null, // should not be null
                odoo_partner_id: 101,
                oauth_id: 'oauth123',
                rfid: 'rfid456',
                steve_id: 200,
            };

            const {error} = fullyQualifiedUserSchema.validate(invalidUser);
            expect(error).toBeDefined();
            expect(error.message).toContain('odoo_user_id');
        });
    });

    describe('steveUserSchema', () => {
        it('should validate a valid steve user', () => {
            const validSteveUser = {
                ocppTagPk: 1,
                idTag: 'rfid123',
                inTransaction: false,
                blocked: false,
                maxActiveTransactionCount: 1,
                expiryDate: null,
                activeTransactionCount: 0,
                note: 'Test note',
            };

            const {error} = steveUserSchema.validate(validSteveUser);
            expect(error).toBeUndefined();
        });

        it('should reject missing required fields', () => {
            const invalidSteveUser = {
                ocppTagPk: 1,
                // missing idTag
                inTransaction: false,
                blocked: false,
                maxActiveTransactionCount: 1,
            };

            const {error} = steveUserSchema.validate(invalidSteveUser);
            expect(error).toBeDefined();
            expect(error.message).toContain('idTag');
        });
    });

    describe('steveTransactionSchema', () => {
        it('should validate a valid steve transaction', () => {
            const validTransaction = {
                id: 1,
                connectorId: 1,
                chargeBoxPk: 100,
                ocppTagPk: 200,
                chargeBoxId: 'charger1',
                ocppIdTag: 'rfid123',
                startTimestamp: new Date().toISOString(),
                stopTimestamp: new Date().toISOString(),
                startValue: 0,
                stopValue: 10,
                stopReason: 'Remote',
                stopEventActor: 'manual',
            };

            const {error} = steveTransactionSchema.validate(validTransaction);
            expect(error).toBeUndefined();
        });

        it('should validate a transaction with null optional fields', () => {
            const validTransaction = {
                id: 1,
                connectorId: null,
                chargeBoxPk: null,
                ocppTagPk: 200,
                chargeBoxId: null,
                ocppIdTag: 'rfid123',
                startTimestamp: new Date().toISOString(),
                stopTimestamp: new Date().toISOString(),
                startValue: 0,
                stopValue: 10,
                stopReason: null,
                stopEventActor: null,
            };

            const {error} = steveTransactionSchema.validate(validTransaction);
            expect(error).toBeUndefined();
        });

        // Commented out for beta release

        // it('should reject if stopValue is less than startValue', () => {
        //     const invalidTransaction = {
        //         id: 1,
        //         connectorId: 1,
        //         chargeBoxPk: 100,
        //         ocppTagPk: 200,
        //         chargeBoxId: 'charger1',
        //         ocppIdTag: 'rfid123',
        //         startTimestamp: new Date().toISOString(),
        //         stopTimestamp: new Date().toISOString(),
        //         startValue: 10,
        //         stopValue: 5, // Less than startValue
        //         stopReason: 'Remote',
        //         stopEventActor: 'manual',
        //     };
        //
        //     const {error} = steveTransactionSchema.validate(invalidTransaction);
        //     expect(error).toBeDefined();
        //     expect(error.message).toContain('stopValue');
        // });
    });

    describe('dbTransactionSchema', () => {
        it('should validate a valid db transaction', () => {
            const validDbTransaction = {
                id: 1,
                created_at: new Date().toISOString(),
                start_timestamp: new Date().toISOString(),
                stop_timestamp: new Date().toISOString(),
                start_value: 0,
                stop_value: 10,
                delivered_energy_wh: 10000,
                ocpp_id_tag: 'rfid123',
            };

            const {error} = dbTransactionSchema.validate(validDbTransaction);
            expect(error).toBeUndefined();
        });

        it('should reject negative energy values', () => {
            const invalidDbTransaction = {
                id: 1,
                created_at: new Date().toISOString(),
                start_timestamp: new Date().toISOString(),
                stop_timestamp: new Date().toISOString(),
                start_value: 0,
                stop_value: 10,
                delivered_energy_wh: -100, // Negative value
                ocpp_id_tag: 'rfid123',
            };

            const {error} = dbTransactionSchema.validate(invalidDbTransaction);
            expect(error).toBeDefined();
            expect(error.message).toContain('delivered_energy_wh');
        });
    });
});
