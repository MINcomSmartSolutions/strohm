const {
    userSchema,
    fullyQualifiedUserSchema,
    steveUserSchema,
    steveTransactionSchema,
    qualifiedTransactionSchema,
    steveCompletedTransactionSchema,
    oidcUserSchema,
    validateUser,
} = require('#utils/joi');
const {
    buildUser,
    buildFullyQualifiedUser,
    buildOidcUser,
    buildSteveTransaction,
    buildSteveCompletedTransaction,
    buildQualifiedTransaction,
} = require('#test_helpers/joiSamples');

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

        it('should allow unknown extra fields', () => {
            const userWithExtra = buildUser({extra_field: 'abc'});
            const {error, value} = userSchema.validate(userWithExtra);
            expect(error).toBeUndefined();
            expect(value.extra_field).toBe('abc');
        });
    });

    describe('fullyQualifiedUserSchema (expanded)', () => {
        it('should validate a valid fully qualified user using factory', () => {
            const validUser = buildFullyQualifiedUser();
            const {error} = fullyQualifiedUserSchema.validate(validUser);
            expect(error).toBeUndefined();
        });

        it('should reject name longer than 255 chars', () => {
            const longName = 'a'.repeat(256);
            const invalidUser = buildFullyQualifiedUser({name: longName});
            const {error} = fullyQualifiedUserSchema.validate(invalidUser);
            expect(error).toBeDefined();
            expect(error.message).toContain('name');
        });

        it('should accept name at 255 chars boundary', () => {
            const boundaryName = 'a'.repeat(255);
            const validUser = buildFullyQualifiedUser({name: boundaryName});
            const {error} = fullyQualifiedUserSchema.validate(validUser);
            expect(error).toBeUndefined();
        });

        it('should reject non-integer user_id', () => {
            const invalidUser = buildFullyQualifiedUser({user_id: 1.5});
            const {error} = fullyQualifiedUserSchema.validate(invalidUser);
            expect(error).toBeDefined();
            expect(error.message).toContain('user_id');
        });

        it('should allow unknown extra fields', () => {
            const userWithExtra = buildFullyQualifiedUser({extra_field: 'xyz'});
            const {error, value} = fullyQualifiedUserSchema.validate(userWithExtra);
            expect(error).toBeUndefined();
            expect(value.extra_field).toBe('xyz');
        });

        it('validateUser should throw ValidationError on invalid input', () => {
            const invalidUser = buildFullyQualifiedUser({user_id: 1.2});
            expect(() => validateUser(invalidUser)).toThrow();
        });

        it('validateUser should not throw on valid input', () => {
            const validUser = buildFullyQualifiedUser();
            expect(() => validateUser(validUser)).not.toThrow();
        });
    });

    describe('oidcUserSchema', () => {
        it('should validate a valid OIDC user', () => {
            const validOidcUser = buildOidcUser();
            const {error} = oidcUserSchema.validate(validOidcUser);
            expect(error).toBeUndefined();
        });

        it('should reject missing sub', () => {
            const invalidOidcUser = buildOidcUser({sub: undefined});
            const {error} = oidcUserSchema.validate(invalidOidcUser);
            expect(error).toBeDefined();
            expect(error.message).toContain('sub');
        });

        it('should reject invalid email', () => {
            const invalidOidcUser = buildOidcUser({email: 'not-an-email'});
            const {error} = oidcUserSchema.validate(invalidOidcUser);
            expect(error).toBeDefined();
            expect(error.message).toContain('email');
        });

        it('should reject null hmMifareSerial', () => {
            const nullSerialUser = buildOidcUser({hmMifareSerial: null});
            const {error} = oidcUserSchema.validate(nullSerialUser);
            expect(error).toBeDefined();
            expect(error.message).toContain('hmMifareSerial');
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

        it('should allow unknown extra fields', () => {
            const txnWithExtra = buildSteveTransaction({extra: 'value'});
            const {error, value} = steveTransactionSchema.validate(txnWithExtra);
            expect(error).toBeUndefined();
            expect(value.extra).toBe('value');
        });
    });

    describe('steveCompletedTransactionSchema', () => {
        it('should validate a valid completed transaction', () => {
            const validTxn = buildSteveCompletedTransaction();
            const {error} = steveCompletedTransactionSchema.validate(validTxn);
            expect(error).toBeUndefined();
        });

        it('should reject stopValue less than startValue', () => {
            const invalidTxn = buildSteveCompletedTransaction({startValue: 10, stopValue: 5});
            const {error} = steveCompletedTransactionSchema.validate(invalidTxn);
            expect(error).toBeDefined();
            expect(error.message).toContain('stopValue');
        });

        it('should reject missing stopTimestamp', () => {
            const invalidTxn = buildSteveCompletedTransaction({stopTimestamp: undefined});
            const {error} = steveCompletedTransactionSchema.validate(invalidTxn);
            expect(error).toBeDefined();
            expect(error.message).toContain('stopTimestamp');
        });

        it('should reject missing stopReason', () => {
            const invalidTxn = buildSteveCompletedTransaction({stopReason: undefined});
            const {error} = steveCompletedTransactionSchema.validate(invalidTxn);
            expect(error).toBeDefined();
            expect(error.message).toContain('stopReason');
        });

        it('should allow unknown extra fields', () => {
            const txnWithExtra = buildSteveCompletedTransaction({extra_field: 'abc'});
            const {error, value} = steveCompletedTransactionSchema.validate(txnWithExtra);
            expect(error).toBeUndefined();
            expect(value.extra_field).toBe('abc');
        });
    });

    describe('qualifiedTransactionSchema', () => {
        it('should validate a valid db transaction', () => {
            const now = new Date();
            const later = new Date(now.getTime() + 3600000); // 1 hour later
            const validDbTransaction = {
                id: 1,
                created_at: now.toISOString(),
                start_timestamp: now.toISOString(),
                stop_timestamp: later.toISOString(),
                start_value: 0,
                stop_value: 10,
                delivered_energy_wh: 10000,
                ocpp_id_tag: 'rfid123',
            };

            const {error} = qualifiedTransactionSchema.validate(validDbTransaction);
            expect(error).toBeUndefined();
        });

        it('should reject negative energy values', () => {
            const now = new Date();
            const later = new Date(now.getTime() + 3600000); // 1 hour later
            const invalidDbTransaction = {
                id: 1,
                created_at: now.toISOString(),
                start_timestamp: now.toISOString(),
                stop_timestamp: later.toISOString(),
                start_value: 0,
                stop_value: 10,
                delivered_energy_wh: -100, // Negative value
                ocpp_id_tag: 'rfid123',
            };

            const {error} = qualifiedTransactionSchema.validate(invalidDbTransaction);
            expect(error).toBeDefined();
            expect(error.message).toContain('delivered_energy_wh');
        });

        it('should reject stop_value less than start_value', () => {
            const invalidDbTxn = buildQualifiedTransaction({start_value: 10, stop_value: 5});
            const {error} = qualifiedTransactionSchema.validate(invalidDbTxn);
            expect(error).toBeDefined();
            expect(error.message).toContain('stop_value');
        });

        it('should reject negative start_value', () => {
            const invalidDbTxn = buildQualifiedTransaction({start_value: -1});
            const {error} = qualifiedTransactionSchema.validate(invalidDbTxn);
            expect(error).toBeDefined();
            expect(error.message).toContain('start_value');
        });

        it('should reject stop_timestamp earlier than start_timestamp', () => {
            const now = new Date();
            const earlier = new Date(now.getTime() - 3600000); // 1 hour earlier
            const invalidDbTxn = buildQualifiedTransaction({
                start_timestamp: now.toISOString(),
                stop_timestamp: earlier.toISOString(),
            });
            const {error} = qualifiedTransactionSchema.validate(invalidDbTxn);
            expect(error).toBeDefined();
            expect(error.message).toContain('stop_timestamp');
        });

        it('should allow unknown extra fields', () => {
            const dbTxnWithExtra = buildQualifiedTransaction({extra_field: 'ok'});
            const {error, value} = qualifiedTransactionSchema.validate(dbTxnWithExtra);
            expect(error).toBeUndefined();
            expect(value.extra_field).toBe('ok');
        });
    });
});
