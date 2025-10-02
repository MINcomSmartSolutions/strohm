const {DateTime} = require('luxon');
const {fmt, ISO_NO_ZONE} = require('#utils/datetime_format');

describe('DateTime Format Utilities', () => {
    describe('fmt function', () => {
        it('should format a valid DateTime object to ISO_NO_ZONE format in UTC', () => {
            // Create a specific DateTime in a timezone
            const dt = DateTime.fromObject({
                year: 2025,
                month: 6,
                day: 17,
                hour: 14,
                minute: 30,
                second: 0,
            }, {zone: 'America/New_York'});

            // Format the DateTime to UTC
            const result = fmt(dt, true);

            // The result should be in UTC (5 hours ahead of NY time in June)
            expect(result).toBe('2025-06-17T18:30:00');
        });

        it('should format a valid DateTime object to ISO_NO_ZONE format in local timezone', () => {
            // Create a specific DateTime in a timezone
            const dt = DateTime.fromObject({
                year: 2025,
                month: 6,
                day: 17,
                hour: 14,
                minute: 30,
                second: 0,
            }, {zone: 'America/New_York'});

            // Format the DateTime without converting to UTC
            const result = fmt(dt, false);

            // The result should be in the original timezone
            expect(result).toBe('2025-06-17T14:30:00');
        });

        it('should format a valid DateTime object to ISO_NO_ZONE format in local timezone', () => {
            // Create a specific DateTime in a timezone
            const dt = DateTime.fromObject({
                year: 2025,
                month: 6,
                day: 17,
                hour: 14,
                minute: 30,
                second: 0,
            }, {zone: 'Europe/Berlin'});

            // Format the DateTime without converting to UTC
            const result = fmt(dt);

            // The result should be in UTC (Berlin is UTC+2 in June)
            expect(result).toBe('2025-06-17T12:30:00');
        });

        it('should throw an error for invalid DateTime object', () => {
            const invalidDt = DateTime.fromObject({year: 2025, month: 13}); // Invalid month

            expect(() => {
                fmt(invalidDt);
            }).toThrow('Invalid DateTime object provided');
        });

        it('should throw an error when null is provided', () => {
            expect(() => {
                fmt(null);
            }).toThrow('Invalid DateTime object provided');
        });

        it('should throw an error when undefined is provided', () => {
            expect(() => {
                fmt(undefined);
            }).toThrow('Invalid DateTime object provided');
        });

        it('should default to converting to UTC when toUTC parameter is not provided', () => {
            const dt = DateTime.fromObject({
                year: 2025,
                month: 6,
                day: 17,
                hour: 14,
                minute: 30,
                second: 0,
            }, {zone: 'America/New_York'});

            // Call fmt without the second parameter
            const result = fmt(dt);

            // Should default to converting to UTC
            expect(result).toBe('2025-06-17T18:30:00');
        });
    });

    it('ISO_NO_ZONE constant should be defined correctly', () => {
        expect(ISO_NO_ZONE).toBe('yyyy-MM-dd\'T\'HH:mm:ss');
    });
});
