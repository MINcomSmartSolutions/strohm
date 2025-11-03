/**
 * @file Tests for RFID normalization and case-insensitive comparison
 */

const {normalizeRFID} = require('#utils/queries');

describe('RFID Normalization', () => {
    describe('normalizeRFID', () => {
        test('should convert lowercase to uppercase', () => {
            expect(normalizeRFID('16380eb123d')).toBe('16380EB123D');
        });

        test('should keep uppercase as is', () => {
            expect(normalizeRFID('16380EB123D')).toBe('16380EB123D');
        });

        test('should handle mixed case', () => {
            expect(normalizeRFID('16380Eb123D')).toBe('16380EB123D');
        });

        test('should trim whitespace', () => {
            expect(normalizeRFID('  16380EB123D  ')).toBe('16380EB123D');
        });

        test('should handle null', () => {
            expect(normalizeRFID(null)).toBe(null);
        });

        test('should handle undefined', () => {
            expect(normalizeRFID(undefined)).toBe(undefined);
        });

        test('should handle empty string', () => {
            expect(normalizeRFID('')).toBe('');
        });

        test('should normalize dev RFIDs consistently', () => {
            const devRfid = 'dev-abc123';
            expect(normalizeRFID(devRfid)).toBe('DEV-ABC123');
        });
    });

    describe('Case-insensitive RFID comparison examples', () => {
        test('should treat different cases as equal after normalization', () => {
            const rfid1 = '16380EB123D';
            const rfid2 = '16380eb123d';
            const rfid3 = '16380Eb123D';

            expect(normalizeRFID(rfid1)).toBe(normalizeRFID(rfid2));
            expect(normalizeRFID(rfid2)).toBe(normalizeRFID(rfid3));
            expect(normalizeRFID(rfid1)).toBe(normalizeRFID(rfid3));
        });

        test('should differentiate actually different RFIDs', () => {
            const rfid1 = '16380EB123D';
            const rfid2 = '16380EB123E';

            expect(normalizeRFID(rfid1)).not.toBe(normalizeRFID(rfid2));
        });
    });
});

