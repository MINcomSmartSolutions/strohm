const {validateSteveUser} = require('#utils/steve');
const {ValidationError, ErrorCodes} = require('#utils/errors');

describe('Steve Utility Functions', () => {
    describe('validateSteveUser', () => {
        const validRfid = 'rfid123';

        it('should validate a valid steve user response', () => {
            const validUserData = {
                ocppTagPk: 1,
                idTag: validRfid,
                inTransaction: false,
                blocked: false,
                maxActiveTransactionCount: 1,
                expiryDate: null,
                activeTransactionCount: 0,
                note: 'Test note',
            };

            // This should not throw an error
            expect(() => validateSteveUser(validUserData, validRfid)).not.toThrow();
        });

        it('should throw ValidationError for missing required fields', () => {
            const invalidUserData = {
                ocppTagPk: 1,
                // Missing idTag field
                inTransaction: false,
                blocked: false,
                maxActiveTransactionCount: 1,
            };

            expect(() => validateSteveUser(invalidUserData, validRfid))
                .toThrow(ValidationError);

            try {
                validateSteveUser(invalidUserData, validRfid);
            } catch (error) {
                expect(error.errorDef.code).toBe(ErrorCodes.VALIDATION.MISSING_PARAMETERS.code);
            }
        });

        it('should throw ValidationError for invalid field values', () => {
            const invalidUserData = {
                ocppTagPk: 1,
                idTag: validRfid,
                inTransaction: 'not-a-boolean', // Should be boolean
                blocked: false,
                maxActiveTransactionCount: 1,
            };

            expect(() => validateSteveUser(invalidUserData, validRfid))
                .toThrow(ValidationError);

            try {
                validateSteveUser(invalidUserData, validRfid);
            } catch (error) {
                expect(error.errorDef.code).toBe(ErrorCodes.VALIDATION.INVALID_FORMAT.code);
            }
        });

        it('should throw ValidationError when idTag does not match expected RFID', () => {
            const userData = {
                ocppTagPk: 1,
                idTag: 'different-rfid', // Not matching the expected RFID
                inTransaction: false,
                blocked: false,
                maxActiveTransactionCount: 1,
            };

            expect(() => validateSteveUser(userData, validRfid))
                .toThrow(ValidationError);

            try {
                validateSteveUser(userData, validRfid);
            } catch (error) {
                expect(error.errorDef.code).toBe(ErrorCodes.VALIDATION.GIVEN_RETURN_DISCREPANCY.code);
                expect(error.message).toContain('ID tag mismatch');
            }
        });
    });
});
