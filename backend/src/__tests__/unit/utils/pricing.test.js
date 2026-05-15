/**
 * @file Unit tests for pricing query functions (electricity prices & VAT rates)
 */

jest.mock('#services/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
}));

const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
};

const mockPool = {
    connect: jest.fn(() => mockClient),
    query: jest.fn(),
};

jest.mock('#services/db_conn', () => mockPool);

jest.mock('#config', () => ({
    GLOBAL_CONFIG: {
        DEFAULT_ELECTRICITY_PRICE_EUR_PER_KWH_NETTO: 0.30,
        ENV: {IS_PRODUCTION: false, IS_DEVELOPMENT: true, IS_TEST: true},
    },
}));

const {db} = require('#utils/queries');
const {DateTime} = require('luxon');

describe('getAllElectricityPrices', () => {
    beforeEach(() => jest.clearAllMocks());

    test('should return all electricity prices', async () => {
        const mockRows = [
            {id: 2, price_eur_kwh: 0.35, valid_from: '2025-06-01', valid_till: null, created_at: '2025-06-01'},
            {id: 1, price_eur_kwh: 0.30, valid_from: '2025-01-01', valid_till: '2025-06-01', created_at: '2025-01-01'},
        ];
        mockPool.query.mockResolvedValueOnce({rows: mockRows});

        const result = await db.getAllElectricityPrices();
        expect(result).toEqual(mockRows);
        expect(mockPool.query).toHaveBeenCalledWith(
            expect.stringContaining('FROM electricity_prices'),
        );
    });

    test('should return empty array when no prices', async () => {
        mockPool.query.mockResolvedValueOnce({rows: []});
        const result = await db.getAllElectricityPrices();
        expect(result).toEqual([]);
    });
});

describe('setElectricityPrice', () => {
    beforeEach(() => jest.clearAllMocks());

    test('should check latest, close previous price, and insert new one', async () => {
        const newRecord = {id: 3, price_eur_kwh: 0.40, valid_from: '2025-07-01T00:00:00.000Z', valid_till: null};
        mockClient.query
            .mockResolvedValueOnce(undefined) // BEGIN
            .mockResolvedValueOnce({
                rows: [{
                    price_eur_kwh: 0.30,
                    valid_from: '2025-01-01T00:00:00.000Z'
                }]
            }) // SELECT latest
            .mockResolvedValueOnce({rowCount: 1}) // UPDATE (close previous)
            .mockResolvedValueOnce({rows: [newRecord]}) // INSERT
            .mockResolvedValueOnce(undefined); // COMMIT

        const validFrom = DateTime.fromISO('2025-07-01T00:00:00.000Z');
        const result = await db.setElectricityPrice(0.40, validFrom);

        expect(result).toEqual(newRecord);
        expect(mockClient.query).toHaveBeenCalledTimes(5);
    });

    test('should work when no existing prices', async () => {
        const newRecord = {id: 1, price_eur_kwh: 0.30, valid_from: '2025-01-01T00:00:00.000Z', valid_till: null};
        mockClient.query
            .mockResolvedValueOnce(undefined) // BEGIN
            .mockResolvedValueOnce({rows: []}) // SELECT latest (empty)
            .mockResolvedValueOnce({rowCount: 0}) // UPDATE
            .mockResolvedValueOnce({rows: [newRecord]}) // INSERT
            .mockResolvedValueOnce(undefined); // COMMIT

        const result = await db.setElectricityPrice(0.30, DateTime.fromISO('2025-01-01T00:00:00.000Z'));
        expect(result).toEqual(newRecord);
    });

    test('should reject valid_from at or before latest price start date', async () => {
        mockClient.query
            .mockResolvedValueOnce(undefined) // BEGIN
            .mockResolvedValueOnce({rows: [{price_eur_kwh: 0.30, valid_from: '2025-06-01T00:00:00.000Z'}]}); // SELECT latest

        await expect(db.setElectricityPrice(0.40, DateTime.fromISO('2025-05-01T00:00:00.000Z')))
            .rejects.toThrow(/setElectricityPrice/);
        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('should reject same price as current active', async () => {
        mockClient.query
            .mockResolvedValueOnce(undefined) // BEGIN
            .mockResolvedValueOnce({rows: [{price_eur_kwh: 0.30, valid_from: '2025-01-01T00:00:00.000Z'}]}); // SELECT latest

        await expect(db.setElectricityPrice(0.30, DateTime.fromISO('2025-07-01T00:00:00.000Z')))
            .rejects.toThrow(/setElectricityPrice/);
        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('should reject negative price', async () => {
        await expect(db.setElectricityPrice(-1, DateTime.now())).rejects.toThrow();
    });

    test('should reject invalid datetime', async () => {
        await expect(db.setElectricityPrice(0.30, null)).rejects.toThrow();
    });

    test('should rollback on error', async () => {
        mockClient.query
            .mockResolvedValueOnce(undefined) // BEGIN
            .mockResolvedValueOnce({rows: []}) // SELECT latest
            .mockRejectedValueOnce(new Error('DB error')); // UPDATE fails

        await expect(db.setElectricityPrice(0.30, DateTime.now())).rejects.toThrow();
        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
        expect(mockClient.release).toHaveBeenCalled();
    });
});

describe('getAllVATRates', () => {
    beforeEach(() => jest.clearAllMocks());

    test('should return all VAT rates', async () => {
        const mockRows = [
            {id: 2, rate: 7, description: 'Reduziert', effective_from: '2025-07-01', effective_to: null},
            {id: 1, rate: 19, description: 'Standard MWSt.', effective_from: '2025-01-01', effective_to: '2025-07-01'},
        ];
        mockPool.query.mockResolvedValueOnce({rows: mockRows});

        const result = await db.getAllVATRates();
        expect(result).toEqual(mockRows);
        expect(mockPool.query).toHaveBeenCalledWith(
            expect.stringContaining('FROM vat_rates'),
        );
    });

    test('should return empty array when no rates', async () => {
        mockPool.query.mockResolvedValueOnce({rows: []});
        const result = await db.getAllVATRates();
        expect(result).toEqual([]);
    });
});

describe('setVATRate', () => {
    beforeEach(() => jest.clearAllMocks());

    test('should check latest, close previous rate, and insert new one', async () => {
        const newRecord = {id: 2, rate: 7, description: 'Reduziert', effective_from: '2025-07-01', effective_to: null};
        mockClient.query
            .mockResolvedValueOnce(undefined) // BEGIN
            .mockResolvedValueOnce({rows: [{rate: 19, effective_from: '2025-01-01T00:00:00.000Z'}]}) // SELECT latest
            .mockResolvedValueOnce({rowCount: 1}) // UPDATE (close previous)
            .mockResolvedValueOnce({rows: [newRecord]}) // INSERT
            .mockResolvedValueOnce(undefined); // COMMIT

        const effectiveFrom = DateTime.fromISO('2025-07-01T00:00:00.000Z');
        const result = await db.setVATRate(7, 'Reduziert', effectiveFrom);

        expect(result).toEqual(newRecord);
        expect(mockClient.query).toHaveBeenCalledTimes(5);
    });

    test('should reject effective_from at or before latest rate start date', async () => {
        mockClient.query
            .mockResolvedValueOnce(undefined) // BEGIN
            .mockResolvedValueOnce({rows: [{rate: 19, effective_from: '2025-06-01T00:00:00.000Z'}]}); // SELECT latest

        await expect(db.setVATRate(7, 'test', DateTime.fromISO('2025-05-01T00:00:00.000Z')))
            .rejects.toThrow(/setVATRate/);
        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('should reject same rate as current active', async () => {
        mockClient.query
            .mockResolvedValueOnce(undefined) // BEGIN
            .mockResolvedValueOnce({rows: [{rate: 19, effective_from: '2025-01-01T00:00:00.000Z'}]}); // SELECT latest

        await expect(db.setVATRate(19, 'same', DateTime.fromISO('2025-07-01T00:00:00.000Z')))
            .rejects.toThrow(/setVATRate/);
        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('should reject rate > 100', async () => {
        await expect(db.setVATRate(101, 'too high', DateTime.now())).rejects.toThrow();
    });

    test('should reject negative rate', async () => {
        await expect(db.setVATRate(-1, 'negative', DateTime.now())).rejects.toThrow();
    });

    test('should reject non-integer rate', async () => {
        await expect(db.setVATRate(19.5, 'float', DateTime.now())).rejects.toThrow();
    });

    test('should reject invalid datetime', async () => {
        await expect(db.setVATRate(19, 'test', null)).rejects.toThrow();
    });

    test('should accept null description', async () => {
        const newRecord = {id: 3, rate: 19, description: null, effective_from: '2025-08-01', effective_to: null};
        mockClient.query
            .mockResolvedValueOnce(undefined) // BEGIN
            .mockResolvedValueOnce({rows: [{rate: 7, effective_from: '2025-07-01T00:00:00.000Z'}]}) // SELECT latest
            .mockResolvedValueOnce({rowCount: 0}) // UPDATE
            .mockResolvedValueOnce({rows: [newRecord]}) // INSERT
            .mockResolvedValueOnce(undefined); // COMMIT

        const result = await db.setVATRate(19, null, DateTime.fromISO('2025-08-01T00:00:00.000Z'));
        expect(result).toEqual(newRecord);
    });

    test('should rollback on error', async () => {
        mockClient.query
            .mockResolvedValueOnce(undefined) // BEGIN
            .mockResolvedValueOnce({rows: []}) // SELECT latest
            .mockRejectedValueOnce(new Error('DB error')); // UPDATE fails

        await expect(db.setVATRate(19, 'test', DateTime.now())).rejects.toThrow();
        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
        expect(mockClient.release).toHaveBeenCalled();
    });
});
