/**
 * @file Unit tests for Steve transactions service
 */
const {DateTime} = require('luxon');
const {
    runIncremental,
} = require('../../../services/steve_transactions');
const {steveAxios} = require('../../../services/network');
const {db} = require('../../../utils/queries');
const {fmt} = require('../../../utils/datetime_format');
const {createOdooTxnInvoice} = require('../../../services/odoo');
const {STEVE_CONFIG} = require('../../../config');

// TODO: Needs reviewing

// Mock dependencies
jest.mock('../../../services/network', () => ({
    steveAxios: {
        get: jest.fn(),
    },
}));

jest.mock('../../../utils/queries', () => ({
    db: {
        getLastStopTimestamp: jest.fn(),
        setLastStopTimestamp: jest.fn(),
        recordTransaction: jest.fn(),
        saveInvoiceId: jest.fn(),
    },
}));

jest.mock('../../../services/odoo', () => ({
    createOdooTxnInvoice: jest.fn(),
}));

jest.mock('../../../utils/datetime_format', () => ({
    fmt: jest.fn(),
}));

jest.mock('../../../services/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

jest.mock('../../../config', () => ({
    STEVE_CONFIG: {
        TRANSACTIONS_URI: '/api/v1/transactions',
    },
}));

describe('Steve Transactions Service', () => {
    // Sample timestamps for testing
    const now = DateTime.fromISO('2025-06-16T12:00:00Z');
    const oneHourAgo = now.minus({hours: 1});
    const twoHoursAgo = now.minus({hours: 2});

    // Sample transaction data
    const sampleTransaction = {
        id: 12345,
        ocppTagPk: 999,
        ocppIdTag: 'test_rfid',
        startTimestamp: '2025-06-16T10:00:00Z',
        stopTimestamp: '2025-06-16T11:00:00Z',
        startValue: 0,
        stopValue: 15.5,
        stopReason: 'CHARGING_COMPLETE',
    };

    const sampleDbTransaction = {
        id: 1,
        tx_steve_id: 12345,
        ocpp_id_tag: 'test_rfid',
        start_timestamp: new Date('2025-06-16T10:00:00Z'),
        stop_timestamp: new Date('2025-06-16T11:00:00Z'),
        start_value: 0,
        stop_value: 15.5,
        stop_reason: 'CHARGING_COMPLETE',
        user_id: 123,
        invoice_ref: null,
        delivered_energy_wh: 15500,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        // Mock DateTime.now() to return our fixed time
        jest.spyOn(DateTime, 'now').mockReturnValue(now);
        // Mock fmt to return the ISO string directly for simplicity
        fmt.mockImplementation(dt => dt.toISO());
    });

    afterEach(() => {
        // Restore all mocks
        jest.restoreAllMocks();
    });

    describe('runIncremental', () => {
        it('should fetch and process new transactions since last high-water mark', async () => {
            // Mock getLastStopTimestamp to return a timestamp
            db.getLastStopTimestamp.mockResolvedValue(oneHourAgo);

            // Mock fetching new transactions
            steveAxios.get.mockResolvedValue({
                status: 200,
                data: [sampleTransaction],
            });

            // Mock processing of transaction
            db.recordTransaction.mockResolvedValue(sampleDbTransaction);

            // Mock invoice creation
            const mockInvoiceId = 5678;
            createOdooTxnInvoice.mockResolvedValue(mockInvoiceId);

            const result = await runIncremental();

            // Verify getLastStopTimestamp was called
            expect(db.getLastStopTimestamp).toHaveBeenCalled();

            // Verify axios get was called with correct parameters (adding 1 second to prevent overlap)
            expect(steveAxios.get).toHaveBeenCalledWith(
                STEVE_CONFIG.TRANSACTIONS_URI,
                {
                    params: {
                        type: 'STOPPED',
                        periodType: 'FROM_TO',
                        from: expect.any(String),
                        to: expect.any(String),
                    },
                },
            );

            // Verify recordTransaction was called with the transaction data
            expect(db.recordTransaction).toHaveBeenCalledWith(sampleTransaction);

            // Verify createOdooTxnInvoice was called for transactions with user_id
            expect(createOdooTxnInvoice).toHaveBeenCalledWith(sampleDbTransaction);

            // Verify saveInvoiceId was called with correct parameters
            expect(db.saveInvoiceId).toHaveBeenCalledWith(sampleDbTransaction, mockInvoiceId);

            // Verify setLastStopTimestamp was called with new high-water mark
            expect(db.setLastStopTimestamp).toHaveBeenCalled();

            // Verify returned result matches expected format
            expect(result).toEqual({
                fetched: 1,
                high_water_mark: expect.any(DateTime),
            });
        });

        it('should handle the case of no previous high-water mark', async () => {
            // Mock getLastStopTimestamp to return null (no previous high-water mark)
            db.getLastStopTimestamp.mockResolvedValue(null);

            // Mock fetching new transactions (empty array - no transactions)
            steveAxios.get.mockResolvedValue({
                status: 200,
                data: [],
            });

            const result = await runIncremental();

            // Verify getLastStopTimestamp was called
            expect(db.getLastStopTimestamp).toHaveBeenCalled();

            // Verify axios get was called with null since parameter
            expect(steveAxios.get).toHaveBeenCalledWith(
                STEVE_CONFIG.TRANSACTIONS_URI,
                {
                    params: {
                        type: 'STOPPED',
                        periodType: 'ALL',
                    },
                },
            );

            // Verify setLastStopTimestamp was called with the current time
            expect(db.setLastStopTimestamp).toHaveBeenCalled();

            // Verify returned result matches expected format for no transactions
            expect(result).toEqual({
                fetched: 0,
                high_water_mark: expect.any(DateTime),
            });
        });

        it('should handle transactions without user_id (not create invoice)', async () => {
            // Mock getLastStopTimestamp to return a timestamp
            db.getLastStopTimestamp.mockResolvedValue(oneHourAgo);

            // Mock fetching new transactions
            steveAxios.get.mockResolvedValue({
                status: 200,
                data: [sampleTransaction],
            });

            // Mock processing of transaction - return a transaction WITHOUT user_id
            const transactionWithoutUser = {
                ...sampleDbTransaction,
                user_id: null, // No user associated
            };
            db.recordTransaction.mockResolvedValue(transactionWithoutUser);

            const result = await runIncremental();

            // Verify getLastStopTimestamp was called
            expect(db.getLastStopTimestamp).toHaveBeenCalled();

            // Verify recordTransaction was called with the transaction data
            expect(db.recordTransaction).toHaveBeenCalledWith(sampleTransaction);

            // Verify createOdooTxnInvoice was NOT called because there's no user_id
            expect(createOdooTxnInvoice).not.toHaveBeenCalled();

            // Verify saveInvoiceId was NOT called
            expect(db.saveInvoiceId).not.toHaveBeenCalled();

            // Verify setLastStopTimestamp was called
            expect(db.setLastStopTimestamp).toHaveBeenCalled();
        });

        it('should handle transactions with existing invoice (not create duplicate)', async () => {
            // Mock getLastStopTimestamp to return a timestamp
            db.getLastStopTimestamp.mockResolvedValue(oneHourAgo);

            // Mock fetching new transactions
            steveAxios.get.mockResolvedValue({
                status: 200,
                data: [sampleTransaction],
            });

            // Mock processing of transaction - return a transaction WITH existing invoice_ref
            const transactionWithInvoice = {
                ...sampleDbTransaction,
                invoice_ref: 9999, // Already has invoice
            };
            db.recordTransaction.mockResolvedValue(transactionWithInvoice);

            const result = await runIncremental();

            // Verify recordTransaction was called with the transaction data
            expect(db.recordTransaction).toHaveBeenCalledWith(sampleTransaction);

            // Verify createOdooTxnInvoice was NOT called because there's already an invoice
            expect(createOdooTxnInvoice).not.toHaveBeenCalled();

            // Verify saveInvoiceId was NOT called
            expect(db.saveInvoiceId).not.toHaveBeenCalled();
        });

        it('should handle duplicate transactions (ensure unique processing)', async () => {
            // Mock getLastStopTimestamp to return a timestamp
            db.getLastStopTimestamp.mockResolvedValue(oneHourAgo);

            // Mock fetching new transactions with a duplicate (same ID)
            const duplicateTransaction = {...sampleTransaction};
            steveAxios.get.mockResolvedValue({
                status: 200,
                data: [sampleTransaction, duplicateTransaction], // Two transactions with the same ID
            });

            // Set up a spy to track unique IDs processed
            const processedIds = new Set();
            db.recordTransaction.mockImplementation(async (transaction) => {
                processedIds.add(transaction.id);
                return sampleDbTransaction;
            });

            // Mock invoice creation
            const mockInvoiceId = 5678;
            createOdooTxnInvoice.mockResolvedValue(mockInvoiceId);

            const result = await runIncremental();

            // Verify only unique IDs were processed
            expect(processedIds.size).toBe(1);
            expect(processedIds.has(sampleTransaction.id)).toBe(true);

            // Verify recordTransaction was called only ONCE despite duplicate in input
            expect(db.recordTransaction).toHaveBeenCalledTimes(1);
            expect(db.recordTransaction).toHaveBeenCalledWith(sampleTransaction);

            // Verify createOdooTxnInvoice was called once
            expect(createOdooTxnInvoice).toHaveBeenCalledTimes(1);

            // Verify saveInvoiceId was called once
            expect(db.saveInvoiceId).toHaveBeenCalledTimes(1);

            // Verify result shows only 1 transaction processed despite 2 in input
            expect(result.fetched).toBe(1);
        });

        it('should count all unique transactions (no duplicates)', async () => {
            db.getLastStopTimestamp.mockResolvedValue(oneHourAgo);
            const tx2 = {...sampleTransaction, id: 54321};
            steveAxios.get.mockResolvedValue({
                status: 200,
                data: [sampleTransaction, tx2],
            });
            db.recordTransaction.mockResolvedValue(sampleDbTransaction);
            createOdooTxnInvoice.mockResolvedValue(5678);
            const result = await runIncremental();
            expect(db.recordTransaction).toHaveBeenCalledTimes(2);
            expect(result.fetched).toBe(2);
        });

        it('should return 0 fetched if no transactions', async () => {
            db.getLastStopTimestamp.mockResolvedValue(oneHourAgo);
            steveAxios.get.mockResolvedValue({status: 200, data: []});
            const result = await runIncremental();
            expect(result.fetched).toBe(0);
        });

        it('should throw error if transaction format is invalid', async () => {
            db.getLastStopTimestamp.mockResolvedValue(oneHourAgo);
            const invalidTransaction = {id: 12345};
            steveAxios.get.mockResolvedValue({status: 200, data: [invalidTransaction]});
            // Patch the schema validate to always return error
            jest.spyOn(require('../../../utils/joi').steveTransactionSchema, 'validate').mockReturnValue({error: new Error('Invalid')});
            await expect(runIncremental()).rejects.toThrow();
        });

        it('should update high-water mark even with no transactions', async () => {
            // Mock getLastStopTimestamp to return a timestamp
            db.getLastStopTimestamp.mockResolvedValue(oneHourAgo);

            // Mock fetching new transactions (empty array - no transactions)
            steveAxios.get.mockResolvedValue({
                status: 200,
                data: [],
            });

            const result = await runIncremental();

            // Verify getLastStopTimestamp was called
            expect(db.getLastStopTimestamp).toHaveBeenCalled();

            // Verify setLastStopTimestamp was still called even though no transactions were processed
            expect(db.setLastStopTimestamp).toHaveBeenCalled();

            // Verify result shows 0 transactions
            expect(result.fetched).toBe(0);
        });
    });
});
