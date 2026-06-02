/**
 * @file Unit tests for Steve transactions service
 */
const {DateTime} = require('luxon');
const {runIncremental, TxnType, TxnPeriodType} = require('#services/steve_transactions');
const {steveAxios} = require('#services/network');
const {db} = require('#utils/queries');
const {fmt} = require('#utils/datetime_format');
const {STEVE_CONFIG} = require('#config');

// TODO: Needs reviewing

// Mock dependencies
jest.mock('#services/network', () => ({
    steveAxios: {
        get: jest.fn(),
    },
}));

jest.mock('#utils/queries', () => ({
    db: {
        recordTransaction: jest.fn(),
    },
}));


jest.mock('#utils/datetime_format', () => ({
    fmt: jest.fn(),
}));

jest.mock('#services/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
}));

jest.mock('#config', () => ({
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
        txn_steve_id: 12345,
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
        it('should fetch and process all transactions', async () => {
            // Mock fetching new transactions
            steveAxios.get.mockResolvedValue({
                status: 200,
                data: [sampleTransaction],
            });

            // Mock processing of transaction
            db.recordTransaction.mockResolvedValue(sampleDbTransaction);

            const result = await runIncremental();

            expect(steveAxios.get).toHaveBeenCalledWith(
                STEVE_CONFIG.TRANSACTIONS_URI,
                {
                    params: {
                        type: TxnType.ACTIVE,
                        periodType: TxnPeriodType.ALL,
                    },
                },
            );
            expect(steveAxios.get).toHaveBeenCalledWith(
                STEVE_CONFIG.TRANSACTIONS_URI,
                {
                    params: {
                        type: TxnType.STOPPED,
                        periodType: TxnPeriodType.ALL,
                    },
                },
            );

            // Verify recordTransaction was called with the transaction data
            expect(db.recordTransaction).toHaveBeenCalledWith(sampleTransaction);

            expect(result).toEqual({
                completedTxnCount: 2,
                fetchedTxnCount: 2, // active and stopped for some txn
                processedTxnCount: 1,
            });
        });

        it('should handle transactions without user_id', async () => {
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

            // Verify recordTransaction was called with the transaction data
            expect(db.recordTransaction).toHaveBeenCalledWith(sampleTransaction);
        });

        it('should handle duplicate transactions (ensure unique processing)', async () => {
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

            const result = await runIncremental();

            // Verify only unique IDs were processed
            expect(processedIds.size).toBe(1);
            expect(processedIds.has(sampleTransaction.id)).toBe(true);

            // Verify recordTransaction was called only ONCE despite duplicate in input
            expect(db.recordTransaction).toHaveBeenCalledTimes(1);
            expect(db.recordTransaction).toHaveBeenCalledWith(sampleTransaction);

            expect(result.processedTxnCount).toBe(1);
            expect(result.fetchedTxnCount).toBe(4); // 2 active + 2 stopped (duplicates counted in fetched)
        });

        it('should count all unique transactions (no duplicates)', async () => {
            const tx2 = {...sampleTransaction, id: 54321};
            steveAxios.get.mockResolvedValue({
                status: 200,
                data: [sampleTransaction, tx2],
            });
            db.recordTransaction.mockResolvedValue(sampleDbTransaction);
            const result = await runIncremental();
            expect(db.recordTransaction).toHaveBeenCalledTimes(2);
            expect(result.processedTxnCount).toBe(2);
            expect(result.fetchedTxnCount).toBe(4);
        });

        it('should return 0 fetched if no transactions', async () => {
            steveAxios.get.mockResolvedValue({status: 200, data: []});
            const result = await runIncremental();
            expect(result.fetchedTxnCount).toBe(0);
            expect(result.processedTxnCount).toBe(0);
        });

        it('should throw error if transaction format is invalid', async () => {
            const invalidTransaction = {id: 12345};
            steveAxios.get.mockResolvedValue({status: 200, data: [invalidTransaction]});
            // Patch the schema validate to always return error
            jest.spyOn(require('#utils/joi').steveTransactionSchema, 'validate').mockReturnValue({error: new Error('Invalid')});
            await expect(runIncremental()).rejects.toThrow();
        });

        it('should return 0 counts when no transactions in window', async () => {
            steveAxios.get.mockResolvedValue({
                status: 200,
                data: [],
            });

            const result = await runIncremental();

            // Verify result shows 0 transactions
            expect(result.fetchedTxnCount).toBe(0);
            expect(result.processedTxnCount).toBe(0);
            expect(result.completedTxnCount).toBe(0);
        });
    });
});
