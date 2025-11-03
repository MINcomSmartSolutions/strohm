/**
 * @file Integration tests for database queries
 */
const {DateTime} = require('luxon');
const {
    setupTestDatabase,
    clearTestData,
    insertTestUser,
    insertTestTransaction,
    insertElectricityPrice,
    closePool,
    teardownTestEnvironment,
} = require('#test_helpers/db-setup');

// Create a mock pool that will be properly initialized in beforeAll
let mockPool;

// Override database connection with test connection
jest.mock('#services/db_conn', () => {
    // Return a proxy object that will be replaced with the real pool once it's ready
    return new Proxy({}, {
        get: (target, prop) => {
            if (!mockPool) {
                throw new Error('Test database not initialized yet');
            }
            return mockPool[prop];
        },
    });
});

// Import queries after mocking the database connection
const {db, normalizeRFID} = require('#utils/queries');
const {ValidationError, DatabaseError} = require('#utils/errors');

describe('Database Queries Integration Tests', () => {
    let pool;
    let testUser;
    const fullQualifiedUser = {
        user_id: 123,
        name: 'Test User',
        email: 'test@example.com',
        odoo_user_id: 789,
        odoo_partner_id: 101112,
        oauth_id: 'oauth123',
        rfid: 'test_rfid',
        steve_id: 999,
    };

    beforeAll(async () => {
        // Initialize the database and assign the pool to our mockPool
        pool = await setupTestDatabase();
        mockPool = pool;
    });

    beforeEach(async () => {
        await clearTestData(pool);
        testUser = await insertTestUser(pool);
    });

    afterAll(async () => {
        await closePool(pool);
        await teardownTestEnvironment();
    });

    describe('User Operations', () => {
        test('createUser should create a new user and return their details', async () => {
            const newUser = await db.createUser(
                'new_oauth_id',
                'New User',
                'new@example.com',
                'new_rfid',
            );

            expect(newUser).toBeDefined();
            expect(newUser.oauth_id).toBe('new_oauth_id');
            expect(newUser.name).toBe('New User');
            expect(newUser.email).toBe('new@example.com');
            expect(newUser.rfid).toBe(normalizeRFID('new_rfid'));
            expect(newUser.user_id).toBeDefined();
        });

        test('createUser should throw when missing required parameters', async () => {
            await expect(db.createUser(null, 'Test User', 'test@example.com', 'test_rfid'))
                .rejects.toThrow(ValidationError);

            await expect(db.createUser('oauth_id', null, 'test@example.com', 'test_rfid'))
                .rejects.toThrow(ValidationError);

            await expect(db.createUser('oauth_id', 'Test User', null, 'test_rfid'))
                .rejects.toThrow(ValidationError);

            await expect(db.createUser('oauth_id', 'Test User', 'test@example.com', null))
                .rejects.toThrow(ValidationError);
        });

        test('getUsers should retrieve users based on filter criteria', async () => {
            // Create additional users with diverse characteristics
            await db.createUser(
                'another_id',
                'Another User',
                'another@example.com',
                'another_rfid',
            );

            await db.createUser(
                'third_id',
                'Third User',
                'third@example.com',
                'third_rfid',
            );

            // Test without filters (all users)
            const allUsers = await db.getUsers();
            expect(allUsers.length).toBeGreaterThanOrEqual(3);

            // Test with specific filter
            const filteredUsers = await db.getUsers({name: 'Test User'});
            expect(filteredUsers.length).toBe(1);
            expect(filteredUsers[0].name).toBe('Test User');

            // Test with multiple filters
            const multiFiltered = await db.getUsers({
                name: 'Another User',
                email: 'another@example.com',
            });
            expect(multiFiltered.length).toBe(1);
            expect(multiFiltered[0].name).toBe('Another User');
            expect(multiFiltered[0].email).toBe('another@example.com');

            // Test with ordering ascending
            const orderedAscUsers = await db.getUsers({}, {orderBy: 'name', orderDirection: 'ASC'});
            expect(orderedAscUsers.length).toBeGreaterThanOrEqual(3);
            expect(orderedAscUsers[0].name.localeCompare(orderedAscUsers[1].name)).toBeLessThan(0);

            // Test with ordering descending
            const orderedUsers = await db.getUsers({}, {orderBy: 'name', orderDirection: 'DESC'});
            expect(orderedUsers.length).toBeGreaterThanOrEqual(3);
            expect(orderedUsers[0].name.localeCompare(orderedUsers[1].name)).toBeGreaterThan(0);

            // Test with limit
            const limitedUsers = await db.getUsers({}, {limit: 1});
            expect(limitedUsers.length).toBe(1);

            // Test with limit and offset
            const offsetUsers = await db.getUsers({}, {limit: 1, offset: 1, orderBy: 'name', orderDirection: 'ASC'});
            expect(offsetUsers.length).toBe(1);
            expect(offsetUsers[0].name).not.toBe(orderedAscUsers[0].name);

            // Test with invalid orderBy parameter
            await expect(db.getUsers({}, {orderBy: 'invalid_column'}))
                .rejects.toThrow(ValidationError);
        });

        test('getUsers should handle null steve_id value filter correctly', async () => {
            // Create a user with null steve_id
            await db.createUser(
                'test_oauth_id999',
                'Test User 2',
                'test@email.com',
                'test_rfid999',
            );
            await db.createUser(
                'test_oauth_id1000',
                'Test User 3',
                'test2@email.com',
                'test_rfid1000',
            );

            // Test retrieving users with null steve_id
            const usersWithNullSteveId = await db.getUsers({steve_id: null});
            expect(usersWithNullSteveId.length).toBeGreaterThanOrEqual(2);
            expect(usersWithNullSteveId[0].steve_id).toBeNull();
        });

        test('getUserUnique should return a single user or null', async () => {
            // Test with existing user by user_id
            const uniqueUserById = await db.getUserUnique({user_id: testUser.user_id});
            expect(uniqueUserById).toBeDefined();
            expect(uniqueUserById.user_id).toBe(testUser.user_id);

            // Test with existing user by rfid
            const uniqueUserByRfid = await db.getUserUnique({rfid: testUser.rfid});
            expect(uniqueUserByRfid).toBeDefined();
            expect(uniqueUserByRfid.rfid).toBe(testUser.rfid);

            // Test with existing user by oauth_id
            const uniqueUserByOauth = await db.getUserUnique({oauth_id: testUser.oauth_id});
            expect(uniqueUserByOauth).toBeDefined();
            expect(uniqueUserByOauth.oauth_id).toBe(testUser.oauth_id);

            // Test with non-existent user
            const nonExistentUser = await db.getUserUnique({user_id: 99999});
            expect(nonExistentUser).toBeNull();

            // Test with invalid filter (no parameters)
            await expect(db.getUserUnique({}))
                .rejects.toThrow(ValidationError);

            // Test with null filters
            await expect(db.getUserUnique(null))
                .rejects.toThrow(ValidationError);

            // Test with non-object filters
            await expect(db.getUserUnique('invalid'))
                .rejects.toThrow(ValidationError);

            // Test multiple users matching criteria (should throw ValidationError)
            // First create two users with the same name
            await db.createUser(
                'duplicate_oauth1',
                'Duplicate Name',
                'dup1@example.com',
                'dup_rfid1',
            );
            await db.createUser(
                'duplicate_oauth2',
                'Duplicate Name',
                'dup2@example.com',
                'dup_rfid2',
            );

            await expect(db.getUserUnique({name: 'Duplicate Name'}))
                .rejects.toThrow(ValidationError);
        });

        test('setUserOdooCredentials should set Odoo credentials', async () => {
            await db.setUserOdooCredentials(
                testUser,
                1234,
                5678,
                'encrypted_key_test',
                'salt_test',
            );

            // Fetch the updated user
            const updatedUser = await db.getUserUnique({user_id: testUser.user_id});

            expect(updatedUser).toBeDefined();
            expect(updatedUser.odoo_user_id).toBe(1234);
            expect(updatedUser.odoo_partner_id).toBe(5678);

            // Check if the API key was stored
            const credentials = await db.getUserOdooCredentials(testUser.user_id);

            expect(credentials).toBeDefined();
            expect(credentials.key).toBe('encrypted_key_test');
            expect(credentials.key_salt).toBe('salt_test');
        });

        test('setUserOdooCredentials should throw when missing required parameters', async () => {
            // Missing user
            await expect(db.setUserOdooCredentials(null, 1234, 5678, 'key', 'salt'))
                .rejects.toThrow(ValidationError);

            // Missing odoo_user_id
            await expect(db.setUserOdooCredentials(testUser, null, 5678, 'key', 'salt'))
                .rejects.toThrow(ValidationError);

            // Missing odoo_partner_id
            await expect(db.setUserOdooCredentials(testUser, 1234, null, 'key', 'salt'))
                .rejects.toThrow(ValidationError);

            // Missing encrypted_key
            await expect(db.setUserOdooCredentials(testUser, 1234, 5678, null, 'salt'))
                .rejects.toThrow(ValidationError);

            // Missing salt
            await expect(db.setUserOdooCredentials(testUser, 1234, 5678, 'key', null))
                .rejects.toThrow(ValidationError);
        });

        test('getUserOdooCredentials should retrieve latest valid key', async () => {
            // First, set credentials
            await db.setUserOdooCredentials(
                testUser,
                1234,
                5678,
                'encrypted_key_1',
                'salt_1',
            );

            // Retrieve credentials
            const credentials = await db.getUserOdooCredentials(testUser.user_id);

            expect(credentials).toBeDefined();
            expect(credentials.key).toBe('encrypted_key_1');
            expect(credentials.key_salt).toBe('salt_1');
            expect(credentials.key_id).toBeDefined();
        });

        test('getUserOdooCredentials should return null when no credentials exist', async () => {
            // User has no credentials yet
            const credentials = await db.getUserOdooCredentials(testUser.user_id);
            expect(credentials).toBeNull();
        });

        test('getUserOdooCredentials should handle missing user_id', async () => {
            await expect(db.getUserOdooCredentials(null))
                .rejects.toThrow(ValidationError);

            await expect(db.getUserOdooCredentials(undefined))
                .rejects.toThrow(ValidationError);
        });

        test('rotateOdooUserKey should revoke old key and create new one', async () => {
            // First, set initial credentials
            const first_key_id = await db.setUserOdooCredentials(
                testUser,
                1234,
                5678,
                'initial_key',
                'initial_salt',
            );

            // Rotate key
            await db.rotateOdooUserKey(
                testUser.user_id,
                first_key_id,
                'rotated_key',
                'rotated_salt',
            );

            // Get new credentials
            const newCreds = await db.getUserOdooCredentials(testUser.user_id);

            expect(newCreds).toBeDefined();
            expect(newCreds.key).toBe('rotated_key');
            expect(newCreds.key_salt).toBe('rotated_salt');
            expect(newCreds.key_id).not.toBe(first_key_id);

            // Verify old key is revoked
            const client = await pool.connect();
            try {
                const result = await client.query(
                    'SELECT revoked_at FROM odoo_apikeys WHERE id = $1',
                    [first_key_id],
                );
                expect(result.rows.length).toBe(1);
                expect(result.rows[0].revoked_at).not.toBeNull();
            } finally {
                client.release();
            }
        });

        test('rotateOdooUserKey should throw with missing or invalid parameters', async () => {
            await db.setUserOdooCredentials(
                testUser,
                1234,
                5678,
                'initial_key',
                'initial_salt',
            );

            const initialCreds = await db.getUserOdooCredentials(testUser.user_id);

            // Missing user_id
            await expect(db.rotateOdooUserKey(
                null,
                initialCreds.key_id,
                'rotated_key',
                'rotated_salt',
            )).rejects.toThrow(ValidationError);

            // Missing old_key_id
            await expect(db.rotateOdooUserKey(
                testUser.user_id,
                null,
                'rotated_key',
                'rotated_salt',
            )).rejects.toThrow(ValidationError);

            // Missing new_key
            await expect(db.rotateOdooUserKey(
                testUser.user_id,
                initialCreds.key_id,
                null,
                'rotated_salt',
            )).rejects.toThrow(ValidationError);

            // Missing new_key_salt
            await expect(db.rotateOdooUserKey(
                testUser.user_id,
                initialCreds.key_id,
                'rotated_key',
                null,
            )).rejects.toThrow(ValidationError);

            // Invalid key_id (non-existent or already revoked)
            await expect(db.rotateOdooUserKey(
                testUser.user_id,
                9999999,
                'rotated_key',
                'rotated_salt',
            )).rejects.toThrow();
        });
    });

    describe('Steve Operations', () => {
        test('setSteveUserParamaters should update steve_id', async () => {
            await db.setSteveUserParamaters(testUser, 5555);

            // Get updated user
            const updatedUser = await db.getUserUnique({user_id: testUser.user_id});

            expect(updatedUser).toBeDefined();
            expect(updatedUser.steve_id).toBe(5555);
        });

        test('setSteveUserParamaters should throw with missing or invalid parameters', async () => {
            // Missing user
            await expect(db.setSteveUserParamaters(null, 5555))
                .rejects.toThrow(ValidationError);

            // Missing steve_id
            await expect(db.setSteveUserParamaters(testUser, null))
                .rejects.toThrow(ValidationError);

            // Invalid user (no user_id)
            await expect(db.setSteveUserParamaters({name: 'Invalid User'}, 5555))
                .rejects.toThrow(ValidationError);
        });
    });

    describe('SteVe Transaction Operations', () => {
        beforeEach(async () => {
            // Update user with Steve ID for transaction association
            await pool.query(
                'UPDATE users SET steve_id = $1 WHERE user_id = $2',
                [1000, testUser.user_id],
            );
        });

        test('recordTransaction should store a new transaction', async () => {
            const now = new Date();
            const startTime = new Date(now.getTime() - 3600000); // 1 hour ago

            const steveTransaction = {
                id: 12345,
                connectorId: 1,
                chargeBoxPk: 100,
                ocppTagPk: 1000, // matches the steve_id we set
                chargeBoxId: 'TEST-CHARGER-01',
                ocppIdTag: testUser.rfid,
                startTimestamp: startTime.toISOString(),
                stopTimestamp: now.toISOString(),
                startValue: 0,
                stopValue: 15,
                stopReason: 'Remote',
                stopEventActor: 'manual',
            };

            const savedTx = await db.recordTransaction(steveTransaction);

            expect(savedTx).toBeDefined();
            expect(savedTx.txn_steve_id).toBe(12345);
            expect(savedTx.user_id).toBe(testUser.user_id);
            expect(savedTx.ocpp_id_tag).toBe(testUser.rfid);
            expect(Number(savedTx.delivered_energy_wh)).toBe(15); // stop_value - start_value = 15
        });

        test('recordTransaction should handle transactions from unknown users', async () => {
            const now = new Date();
            const startTime = new Date(now.getTime() - 3600000);

            const steveTransaction = {
                id: 12346,
                connectorId: 1,
                chargeBoxPk: 100,
                ocppTagPk: 9999, // Unknown steve_id
                chargeBoxId: 'TEST-CHARGER-01',
                ocppIdTag: 'unknown_rfid',
                startTimestamp: startTime.toISOString(),
                stopTimestamp: now.toISOString(),
                startValue: 0,
                stopValue: 15,
                stopReason: 'Remote',
                stopEventActor: 'manual',
            };

            const savedTx = await db.recordTransaction(steveTransaction);

            expect(savedTx).toBeDefined();
            expect(savedTx.txn_steve_id).toBe(12346);
            expect(savedTx.user_id).toBeNull(); // No user association
            expect(savedTx.ocpp_id_tag).toBe('unknown_rfid');
        });

        test('recordTransaction should update an existing transaction', async () => {
            // First, create a transaction
            const now = new Date();
            const startTime = new Date(now.getTime() - 3600000);

            const steveTransaction = {
                id: 54350,
                connectorId: 1,
                chargeBoxPk: 100,
                ocppTagPk: 1000,
                chargeBoxId: 'TEST-CHARGER-01',
                ocppIdTag: testUser.rfid,
                startTimestamp: startTime.toISOString(),
                stopTimestamp: null,
                startValue: 0,
                stopValue: null,
                stopReason: null,
                stopEventActor: 'manual',
            };

            await db.recordTransaction(steveTransaction);

            // Now update with new values
            const updatedTx = {
                ...steveTransaction,
                stopValue: 20,
                stopTimestamp: new Date().toISOString(),
            };

            const saved = await db.recordTransaction(updatedTx);

            expect(saved).toBeDefined();
            expect(saved.txn_steve_id).toBe(54350);
            expect(Number(saved.stop_value)).toBe(20);
            expect(Number(saved.delivered_energy_wh)).toBe(20);
        });

        test('recordTransaction should return existing transaction if ids matches', async () => {
            const now = new Date();
            const startTime = new Date(now.getTime() - 3600000);

            const steveTransaction = {
                id: 54322,
                connectorId: 1,
                chargeBoxPk: 100,
                ocppTagPk: 1000,
                chargeBoxId: 'TEST-CHARGER-01',
                ocppIdTag: testUser.rfid,
                startTimestamp: startTime.toISOString(),
                stopTimestamp: now.toISOString(),
                startValue: 10,
                stopValue: 520,
                stopReason: 'Remote',
                stopEventActor: 'manual',
            };

            // Create initial transaction
            const initialTx = await db.recordTransaction(steveTransaction);

            // Try to save the same transaction again
            const savedAgainTx = await db.recordTransaction(steveTransaction);

            // Should be the same record, not a new one
            expect(savedAgainTx.id).toBe(initialTx.id);
            expect(savedAgainTx.txn_steve_id).toBe(initialTx.txn_steve_id);
        });

        test('recordTransaction should resolve user_id during update if initially NULL', async () => {
            const now = new Date();
            const startTime = new Date(now.getTime() - 3600000);

            // Create a transaction WITHOUT user (unknown user)
            const steveTransaction = {
                id: 54323,
                connectorId: 1,
                chargeBoxPk: 100,
                ocppTagPk: 9999, // Unknown steve_id initially
                chargeBoxId: 'TEST-CHARGER-01',
                ocppIdTag: 'new_user_rfid',
                startTimestamp: startTime.toISOString(),
                stopTimestamp: null,
                startValue: 0,
                stopValue: null,
                stopReason: null,
                stopEventActor: null,
            };

            const initialTx = await db.recordTransaction(steveTransaction);
            expect(initialTx.user_id).toBeNull(); // No user initially

            // Now "register" the user by updating testUser with this steve_id and rfid
            await pool.query(
                'UPDATE users SET steve_id = $1, rfid = $2 WHERE user_id = $3',
                [9999, 'new_user_rfid', testUser.user_id],
            );

            // Update the transaction with stop values
            const updatedTransaction = {
                ...steveTransaction,
                stopTimestamp: now.toISOString(),
                stopValue: 25,
                stopReason: 'Remote',
            };

            const updatedTx = await db.recordTransaction(updatedTransaction);

            // Should now have the user_id resolved
            expect(updatedTx.user_id).toBe(testUser.user_id);
            expect(Number(updatedTx.stop_value)).toBe(25);
        });

        test('recordTransaction should log error when RFID mismatches during INSERT', async () => {
            const logger = require('#services/logger');
            const errorSpy = jest.spyOn(logger, 'error');

            const now = new Date();
            const startTime = new Date(now.getTime() - 3600000);

            // Transaction with RFID that doesn't match the user's RFID in database
            const steveTransaction = {
                id: 54324,
                connectorId: 1,
                chargeBoxPk: 100,
                ocppTagPk: 1000, // Matches testUser's steve_id
                chargeBoxId: 'TEST-CHARGER-01',
                ocppIdTag: 'mismatched_rfid', // Different from testUser.rfid
                startTimestamp: startTime.toISOString(),
                stopTimestamp: now.toISOString(),
                startValue: 0,
                stopValue: 15,
                stopReason: 'Remote',
                stopEventActor: 'manual',
            };

            const savedTx = await db.recordTransaction(steveTransaction);

            // Transaction should still be saved with the user_id
            expect(savedTx.user_id).toBe(testUser.user_id);
            expect(savedTx.ocpp_id_tag).toBe('mismatched_rfid');

            // But should have logged an error about the RFID mismatch
            expect(errorSpy).toHaveBeenCalledWith(
                expect.stringContaining('RFID mismatch'),
                expect.objectContaining({
                    steve_id: 1000,
                    txn_steve_id: 54324,
                }),
            );

            errorSpy.mockRestore();
        });

        test('recordTransaction should log error when RFID mismatches during UPDATE', async () => {
            const logger = require('#services/logger');
            const errorSpy = jest.spyOn(logger, 'error');

            const now = new Date();
            const startTime = new Date(now.getTime() - 3600000);

            // First create a transaction without user
            const steveTransaction = {
                id: 54325,
                connectorId: 1,
                chargeBoxPk: 100,
                ocppTagPk: 8888, // Unknown initially
                chargeBoxId: 'TEST-CHARGER-01',
                ocppIdTag: 'another_rfid',
                startTimestamp: startTime.toISOString(),
                stopTimestamp: null,
                startValue: 0,
                stopValue: null,
                stopReason: null,
                stopEventActor: null,
            };

            await db.recordTransaction(steveTransaction);

            // Now create a user with this steve_id but DIFFERENT rfid
            await pool.query(
                'UPDATE users SET steve_id = $1, rfid = $2 WHERE user_id = $3',
                [8888, 'different_rfid', testUser.user_id],
            );

            // Update transaction
            const updatedTransaction = {
                ...steveTransaction,
                stopTimestamp: now.toISOString(),
                stopValue: 30,
                stopReason: 'Remote',
            };

            const updatedTx = await db.recordTransaction(updatedTransaction);

            // Should resolve user_id but log error about mismatch
            expect(updatedTx.user_id).toBe(testUser.user_id);
            expect(errorSpy).toHaveBeenCalledWith(
                expect.stringContaining('RFID mismatch'),
                expect.any(Object),
            );

            errorSpy.mockRestore();
        });

        test('recordTransaction should reject invalid transaction data', async () => {
            const invalidTransaction = {
                id: 54326,
                // Missing required fields like ocppTagPk, ocppIdTag, startTimestamp, startValue
            };

            await expect(db.recordTransaction(invalidTransaction))
                .rejects.toThrow();
        });

        test('recordTransaction should update stop_event_actor field', async () => {
            const now = new Date();
            const startTime = new Date(now.getTime() - 3600000);

            const steveTransaction = {
                id: 54327,
                connectorId: 1,
                chargeBoxPk: 100,
                ocppTagPk: 1000,
                chargeBoxId: 'TEST-CHARGER-01',
                ocppIdTag: testUser.rfid,
                startTimestamp: startTime.toISOString(),
                stopTimestamp: null,
                startValue: 0,
                stopValue: null,
                stopReason: null,
                stopEventActor: null,
            };

            await db.recordTransaction(steveTransaction);

            // Update with stop_event_actor
            const updatedTransaction = {
                ...steveTransaction,
                stopTimestamp: now.toISOString(),
                stopValue: 35,
                stopReason: 'Remote',
                stopEventActor: 'operator',
            };

            const updatedTx = await db.recordTransaction(updatedTransaction);

            expect(updatedTx.stop_event_actor).toBe('operator');
            expect(Number(updatedTx.stop_value)).toBe(35);
        });

        test('saveInvoiceId should link an invoice to a transaction', async () => {
            // First create a transaction
            const txn = await insertTestTransaction(pool, testUser);

            // Link invoice
            await db.saveInvoiceId(txn, 98765);

            // Verify link
            const client = await pool.connect();
            try {
                const result = await client.query(
                    'SELECT invoice_ref FROM charging_transactions WHERE id = $1',
                    [txn.id],
                );

                expect(result.rows[0].invoice_ref).toBe(98765);
            } finally {
                client.release();
            }
        });
    });

    describe('Electricity Price', () => {
        test('getCurrentElectricityPrice should should return null if no records found at the database', async () => {
            const price = await db.getCurrentElectricityPrice();

            expect(price).toBeDefined();
            expect(price).toBe(null);
        });

        test('getCurrentElectricityPrice should return current price', async () => {
            // Insert test price
            await insertElectricityPrice(pool);

            const price = await db.getCurrentElectricityPrice();

            expect(price).toBeDefined();
            expect(price).toBe(42);
        });

        test('getCurrentElectricityPrice should return price for specific date', async () => {
            // Insert test price
            await insertElectricityPrice(pool);

            const yesterdayDate = DateTime.now().minus({days: 1});
            const price = await db.getCurrentElectricityPrice(yesterdayDate);

            expect(price).toBeDefined();
            expect(price).toBe(42);
        });

        test('getCurrentElectricityPrice should throw with invalid dateTime', async () => {
            await expect(db.getCurrentElectricityPrice('invalid-date'))
                .rejects.toThrow(ValidationError);
        });

        test('getCurrentElectricityPrice should handle multiple price periods correctly', async () => {
            // Insert a price effective from 3 days ago
            const client = await pool.connect();
            try {
                await client.query(
                    `INSERT INTO electricity_prices (price, valid_from, valid_till)
                     VALUES ($1, NOW() - INTERVAL '3 days', NOW() - INTERVAL '1 day')`,
                    [25],
                );

                // Insert current price (already done in insertElectricityPrice)
                await insertElectricityPrice(pool);

                // Check price from 2 days ago (should be 25)
                const oldDate = DateTime.now().minus({days: 2});
                const oldPrice = await db.getCurrentElectricityPrice(oldDate);
                expect(oldPrice).toBe(25);

                // Check current price (should be 42)
                const currentPrice = await db.getCurrentElectricityPrice();
                expect(currentPrice).toBe(42);
            } finally {
                client.release();
            }
        });

        test('getCurrentElectricityPrice should handle price of "0" correctly without specified date', async () => {
            // Insert a price of 0
            const client = await pool.connect();
            try {
                await client.query(
                    `INSERT INTO electricity_prices (price, valid_from, valid_till)
                     VALUES ($1, NOW() - INTERVAL '1 hour', NULL)`,
                    [0],
                );

                const price = await db.getCurrentElectricityPrice();
                expect(price).toBe(0);
            } finally {
                client.release();
            }
        });

        test('getCurrentElectricityPrice should handle price of "0" correctly with specified date', async () => {
            const client = await pool.connect();
            try {
                // Insert a price of 0 effective from 2 days ago to 1 day ago
                await client.query(
                    `INSERT INTO electricity_prices (price, valid_from, valid_till)
                     VALUES ($1, NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day')`,
                    [0],
                );

                const testDate = DateTime.now().minus({days: 1, hours: 12});
                const price = await db.getCurrentElectricityPrice(testDate);
                expect(price).toBe(0);

            } finally {
                client.release();
            }
        });
    });

    describe('Watermark', () => {
        test('setLastStopTimestamp and getLastStopTimestamp should work', async () => {
            const testDate = DateTime.now().minus({hours: 2});

            // Set watermark
            await db.setLastStopTimestamp(testDate);

            // Get watermark
            const watermark = await db.getLastStopTimestamp();

            expect(watermark).toBeDefined();
            expect(watermark.toJSDate().getTime()).toBeCloseTo(testDate.toJSDate().getTime()); // Allow small difference due to DB conversion
        });

        test('getLastStopTimestamp should return null when no watermark exists', async () => {
            // Clear watermarks if any exist
            const client = await pool.connect();
            try {
                await client.query('TRUNCATE watermark');

                // Get watermark when none exists
                const watermark = await db.getLastStopTimestamp();
                expect(watermark).toBeNull();
            } finally {
                client.release();
            }
        });

        test('setLastStopTimestamp should update existing timestamp', async () => {
            // Set initial watermark
            const initialDate = DateTime.now();

            await db.setLastStopTimestamp(initialDate);

            await db.setLastStopTimestamp(initialDate);

            await db.setLastStopTimestamp(initialDate);

            const watermark = await db.getLastStopTimestamp();

            expect(watermark.toJSDate().getTime()).toBeCloseTo(initialDate.toJSDate().getTime(), -3);

            // Check that there's only one record
            const client = await pool.connect();
            try {
                const result = await client.query('SELECT * FROM watermark');
                const count = await client.query('SELECT COUNT(*) FROM watermark');
                expect(parseInt(result.rows.length)).toBe(1);
                expect(parseInt(result.rows[0].id)).toBeGreaterThan(1);
                expect(parseInt(count.rows[0].count)).toBe(1);

            } finally {
                client.release();
            }
        });
    });

    describe('Activity Log', () => {
        test('recordActivityLog should record an activity', async () => {
            await db.recordActivityLog(testUser.user_id, 'TEST_EVENT', 'TEST_TARGET', testUser.rfid);

            // Verify log entry
            const client = await pool.connect();
            try {
                const result = await client.query(
                    'SELECT * FROM activity_log WHERE user_id = $1 AND event_type = $2',
                    [testUser.user_id, 'TEST_EVENT'],
                );

                expect(result.rows.length).toBe(1);
                expect(result.rows[0].target).toBe('TEST_TARGET');
                expect(result.rows[0].rfid).toBe(testUser.rfid);
                expect(result.rows[0].created_at).toBeDefined();
            } finally {
                client.release();
            }
        });

        test('recordActivityLog should record an activity with reason', async () => {
            await db.recordActivityLog(testUser.user_id, 'TEST_EVENT', 'TEST_TARGET', testUser.rfid, 'Test reason');

            // Verify log entry
            const client = await pool.connect();
            try {
                const result = await client.query(
                    'SELECT * FROM activity_log WHERE user_id = $1 AND event_type = $2',
                    [testUser.user_id, 'TEST_EVENT'],
                );

                expect(result.rows.length).toBe(1);
                expect(result.rows[0].reason).toBe('Test reason');
            } finally {
                client.release();
            }
        });

        test('recordActivityLog should handle missing user_id gracefully', async () => {
            // Should not throw when user_id is null
            await expect(db.recordActivityLog(null, 'TEST_EVENT', 'TEST_TARGET', 'test_rfid'))
                .resolves.not.toThrow();

            // No entry should be created
            const client = await pool.connect();
            try {
                const result = await client.query(
                    'SELECT * FROM activity_log WHERE event_type = $1 AND target = $2 AND rfid = $3',
                    ['TEST_EVENT', 'TEST_TARGET', 'test_rfid'],
                );
                expect(result.rows.length).toBe(0);
            } finally {
                client.release();
            }
        });

        test('recordActivityLog should handle missing event data gracefully', async () => {
            // Should not throw when event type is missing
            await expect(db.recordActivityLog(testUser.user_id, null, 'TEST_TARGET', testUser.rfid))
                .resolves.not.toThrow();

            // Should not throw when target is missing
            await expect(db.recordActivityLog(testUser.user_id, 'TEST_EVENT', null, testUser.rfid))
                .resolves.not.toThrow();

            // Should not throw when rfid is missing
            await expect(db.recordActivityLog(testUser.user_id, 'TEST_EVENT', 'TEST_TARGET', null))
                .resolves.not.toThrow();
        });

        test('recordActivityLog should handle multiple activities for the same user', async () => {
            // Record multiple activities
            await db.recordActivityLog(testUser.user_id, 'EVENT_1', 'TARGET_1', testUser.rfid);
            await db.recordActivityLog(testUser.user_id, 'EVENT_2', 'TARGET_2', testUser.rfid);
            await db.recordActivityLog(testUser.user_id, 'EVENT_3', 'TARGET_3', testUser.rfid);

            // Verify all entries
            const client = await pool.connect();
            try {
                const result = await client.query(
                    'SELECT * FROM activity_log WHERE user_id = $1 ORDER BY created_at ASC',
                    [testUser.user_id],
                );

                expect(result.rows.length).toBe(3);
                expect(result.rows[0].event_type).toBe('EVENT_1');
                expect(result.rows[1].event_type).toBe('EVENT_2');
                expect(result.rows[2].event_type).toBe('EVENT_3');
            } finally {
                client.release();
            }
        });
    });

    describe('Error Handling Edge Cases', () => {
        test('database connection errors should be handled properly', async () => {
            // Mock pool.connect to simulate connection failure
            const originalConnect = pool.connect;
            pool.connect = jest.fn().mockRejectedValue(new Error('Connection failed'));

            try {
                await expect(db.createUser('test_oauth', 'Test User', 'test@email.com', 'test_rfid'))
                    .rejects.toThrow();
            } finally {
                // Restore original connect method
                pool.connect = originalConnect;
            }
        });

        test('transaction rollback should work correctly', async () => {
            // Create a user first
            const user = await db.createUser('rollback_test', 'Rollback User', 'rollback@test.com', 'rollback_rfid');

            // Mock client.query to fail on the second query (after BEGIN)
            const originalConnect = pool.connect;
            let callCount = 0;

            pool.connect = jest.fn().mockImplementation(() => {
                const mockClient = {
                    query: jest.fn().mockImplementation((query) => {
                        callCount++;
                        if (query === 'BEGIN') {
                            return Promise.resolve();
                        } else if (callCount === 2) {
                            // Fail on the actual operation
                            return Promise.reject(new Error('Simulated query failure'));
                        } else if (query === 'ROLLBACK') {
                            return Promise.resolve();
                        }
                        return Promise.resolve();
                    }),
                    release: jest.fn()
                };
                return Promise.resolve(mockClient);
            });

            try {
                await expect(db.setUserOdooCredentials(user, 123, 456, 'test_key', 'test_salt'))
                    .rejects.toThrow();
            } finally {
                // Restore original connect method
                pool.connect = originalConnect;
            }
        });

        test('query error handling should log and re-throw errors', async () => {
            // Test handleQueryError function by triggering a database error
            const originalQuery = pool.query;
            pool.query = jest.fn().mockRejectedValue(new Error('Simulated database error'));

            try {
                await expect(db.getUserOdooCredentials('a'))
                    .rejects.toThrow();
            } finally {
                // Restore original query method
                pool.query = originalQuery;
            }
        });
    });

    describe('Advanced Query Options', () => {
        test('getUsers should handle complex ordering scenarios', async () => {
            // Create users with different creation times
            await db.createUser('user1', 'User One', 'user1@test.com', 'rfid1');
            await db.createUser('user2', 'User Two', 'user2@test.com', 'rfid2');
            await db.createUser('user3', 'User Three', 'user3@test.com', 'rfid3');

            // Test ordering by created_at
            const orderedByDate = await db.getUsers({}, {orderBy: 'created_at', orderDirection: 'ASC'});
            expect(orderedByDate.length).toBeGreaterThanOrEqual(4);

            // Test ordering by email
            const orderedByEmail = await db.getUsers({}, {orderBy: 'email', orderDirection: 'DESC'});
            expect(orderedByEmail.length).toBeGreaterThanOrEqual(4);

            // Test default ASC ordering when direction not specified
            const defaultOrder = await db.getUsers({}, {orderBy: 'name'});
            expect(defaultOrder.length).toBeGreaterThanOrEqual(4);
        });

        test('getUsers should handle pagination correctly', async () => {
            // Create multiple users for pagination testing
            for (let i = 1; i <= 5; i++) {
                await db.createUser(`paginate_user${i}`, `Paginate User ${i}`, `paginate${i}@test.com`, `paginate_rfid${i}`);
            }

            // Test first page
            const firstPage = await db.getUsers({}, {limit: 2, offset: 0, orderBy: 'name', orderDirection: 'ASC'});
            expect(firstPage.length).toBe(2);

            // Test second page
            const secondPage = await db.getUsers({}, {limit: 2, offset: 2, orderBy: 'name', orderDirection: 'ASC'});
            expect(secondPage.length).toBe(2);

            // Verify different results
            expect(firstPage[0].user_id).not.toBe(secondPage[0].user_id);
        });
    });

    describe('User Management Functions', () => {
        test('deactivateUser should deactivate an active user', async () => {
            // Deactivate the test user
            await db.deactivateUser(testUser);

            // Verify user is deactivated
            const deactivatedUser = await db.getUserUnique({user_id: testUser.user_id});
            expect(deactivatedUser.deactivated_at).not.toBeNull();
        });

        test('deactivateUser should throw when trying to deactivate already deactivated user', async () => {
            // Deactivate the test user first
            await db.deactivateUser(testUser);

            // Try to deactivate again
            await expect(db.deactivateUser(testUser))
                .rejects.toThrow('Error during deactivateUser operation.');
        });

        test('deactivateUser should throw when user parameter is missing', async () => {
            await expect(db.deactivateUser(null))
                .rejects.toThrow(ValidationError);

            await expect(db.deactivateUser({name: 'No user_id'}))
                .rejects.toThrow(ValidationError);
        });

        test('activateUser should activate a deactivated user', async () => {
            // First deactivate the user
            await db.deactivateUser(testUser);

            // Verify user is deactivated
            let user = await db.getUserUnique({user_id: testUser.user_id});
            expect(user.deactivated_at).not.toBeNull();

            // Now activate the user
            await db.activateUser(user);

            // Verify user is active
            user = await db.getUserUnique({user_id: testUser.user_id});
            expect(user.deactivated_at).toBeNull();
        });

        test('activateUser should throw when trying to activate already active user', async () => {
            // Try to activate an already active user
            await expect(db.activateUser(testUser))
                .rejects.toThrow('Error during activateUser operation.');
        });

        test('activateUser should throw when user parameter is missing', async () => {
            await expect(db.activateUser(null))
                .rejects.toThrow(ValidationError);

            await expect(db.activateUser({name: 'No user_id'}))
                .rejects.toThrow(ValidationError);
        });

        test('revokeUserOdooCredentials should revoke credentials when they exist', async () => {
            // First set credentials
            await db.setUserOdooCredentials(testUser, 1234, 5678, 'test_key', 'test_salt');

            // Revoke credentials
            await db.revokeUserOdooCredentials(testUser);

            // Verify credentials are revoked
            const credentials = await db.getUserOdooCredentials(testUser.user_id);
            expect(credentials).toBeNull();
        });

        test('revokeUserOdooCredentials should handle users with no credentials gracefully', async () => {
            const logger = require('#services/logger');
            const warnSpy = jest.spyOn(logger, 'warn');

            // Try to revoke credentials for user without any
            await expect(db.revokeUserOdooCredentials(testUser))
                .resolves.not.toThrow();

            // Should log warning
            expect(warnSpy).toHaveBeenCalledWith(
                'No Odoo credentials found to revoke for user',
                expect.objectContaining({user_id: testUser.user_id})
            );

            warnSpy.mockRestore();
        });

        test('revokeUserOdooCredentials should throw when user parameter is missing', async () => {
            await expect(db.revokeUserOdooCredentials(null))
                .rejects.toThrow(ValidationError);

            await expect(db.revokeUserOdooCredentials({name: 'No user_id'}))
                .rejects.toThrow(ValidationError);
        });

        test('deleteUser should permanently delete a user', async () => {
            // Create a user to delete
            const userToDelete = await db.createUser('delete_me', 'Delete Me', 'delete@test.com', 'delete_rfid');

            // Delete the user
            await db.deleteUser(userToDelete);

            // Verify user is gone
            const deletedUser = await db.getUserUnique({user_id: userToDelete.user_id});
            expect(deletedUser).toBeNull();
        });

        test('deleteUser should throw when trying to delete non-existent user', async () => {
            const fakeUser = {user_id: 999999, rfid: 'fake'};

            await expect(db.deleteUser(fakeUser))
                .rejects.toThrow();
        });

        test('deleteUser should throw when user parameter is missing', async () => {
            await expect(db.deleteUser(null))
                .rejects.toThrow(ValidationError);

            await expect(db.deleteUser({name: 'No user_id'}))
                .rejects.toThrow(ValidationError);
        });

        test('getUsersCount should return correct count with no filters', async () => {
            // Create some users
            await db.createUser('count_user1', 'Count User 1', 'count1@test.com', 'count_rfid1');
            await db.createUser('count_user2', 'Count User 2', 'count2@test.com', 'count_rfid2');

            const count = await db.getUsersCount();
            expect(count).toBeGreaterThanOrEqual(3);
        });

        test('getUsersCount should return correct count with filters', async () => {
            // Create users with specific attributes
            await db.createUser('filtered1', 'Filtered User', 'filtered1@test.com', 'filtered_rfid1');
            await db.createUser('filtered2', 'Filtered User', 'filtered2@test.com', 'filtered_rfid2');

            const count = await db.getUsersCount({name: 'Filtered User'});
            expect(count).toBe(2);
        });

        test('getUsersCount should handle null value filters', async () => {
            // Create a user without steve_id to ensure at least one result
            await db.createUser('no_steve_id', 'No Steve User', 'nosteve@test.com', 'no_steve_rfid');

            const count = await db.getUsersCount({steve_id: null});
            expect(count).toBeGreaterThan(0);
        });

        test('updateUser should update user fields correctly', async () => {
            const updates = {
                name: 'Updated Name',
                email: 'updated@test.com',
                rfid: 'updated_rfid',
            };

            const updatedUser = await db.updateUser(testUser.user_id, updates);

            expect(updatedUser.name).toBe('Updated Name');
            expect(updatedUser.email).toBe('updated@test.com');
            expect(updatedUser.rfid).toBe(normalizeRFID('updated_rfid'));
            expect(updatedUser.updated_at).not.toBeNull();
        });

        test('updateUser should update multiple fields at once', async () => {
            const updates = {
                first_name: 'John',
                last_name: 'Doe',
                address: '123 Main St',
                postal_code: 12345,
            };

            const updatedUser = await db.updateUser(testUser.user_id, updates);

            expect(updatedUser.first_name).toBe('John');
            expect(updatedUser.last_name).toBe('Doe');
            expect(updatedUser.address).toBe('123 Main St');
            expect(updatedUser.postal_code).toEqual(12345);
        });

        test('updateUser should handle undefined values by skipping them', async () => {
            const updates = {
                name: 'New Name',
                email: undefined,
            };

            const updatedUser = await db.updateUser(testUser.user_id, updates);

            expect(updatedUser.name).toBe('New Name');
            expect(updatedUser.email).toBe(testUser.email); // Should remain unchanged
        });

        test('updateUser should throw when userId is invalid', async () => {
            await expect(db.updateUser(null, {name: 'Test'}))
                .rejects.toThrow(ValidationError);

            await expect(db.updateUser(undefined, {name: 'Test'}))
                .rejects.toThrow(ValidationError);

            await expect(db.updateUser('not_a_number', {name: 'Test'}))
                .rejects.toThrow(ValidationError);

            await expect(db.updateUser(3.14, {name: 'Test'}))
                .rejects.toThrow(ValidationError);
        });

        test('updateUser should throw when updates is empty or invalid', async () => {
            await expect(db.updateUser(testUser.user_id, {}))
                .rejects.toThrow(ValidationError);

            await expect(db.updateUser(testUser.user_id, null))
                .rejects.toThrow(ValidationError);

            await expect(db.updateUser(testUser.user_id, ''))
                .rejects.toThrow(ValidationError);
        });

        test('updateUser should throw when updates contains only undefined values', async () => {
            await expect(db.updateUser(testUser.user_id, {name: undefined, email: undefined}))
                .rejects.toThrow(ValidationError);
        });

        test('updateUser should throw when trying to update non-whitelisted column', async () => {
            await expect(db.updateUser(testUser.user_id, {malicious_field: 'hack'}))
                .rejects.toThrow(ValidationError);

            await expect(db.updateUser(testUser.user_id, {user_id: 999}))
                .rejects.toThrow(ValidationError);
        });

        test('updateUser should throw when user does not exist', async () => {
            await expect(db.updateUser(999999, {name: 'Test'}))
                .rejects.toThrow(DatabaseError);
        });

        test('updateUser should update timestamp fields correctly', async () => {
            const testDate = new Date('2025-01-01T12:00:00Z');

            const updatedUser = await db.updateUser(testUser.user_id, {
                lastlogin_at: testDate,
            });

            expect(updatedUser.lastlogin_at).toBeDefined();
        });
    });

    describe('setUserOdooCredentials edge cases', () => {
        test('setUserOdooCredentials should throw when rowCount is 0', async () => {
            // Mock pool.connect to return a client that returns rowCount 0
            const originalConnect = pool.connect;
            pool.connect = jest.fn().mockImplementation(() => {
                const mockClient = {
                    query: jest.fn()
                        .mockResolvedValueOnce({}) // BEGIN
                        .mockResolvedValueOnce({}) // UPDATE users
                        .mockResolvedValueOnce({rows: [], rowCount: 0}), // INSERT odoo_apikeys
                    release: jest.fn()
                };
                return Promise.resolve(mockClient);
            });

            try {
                await expect(db.setUserOdooCredentials(testUser, 1234, 5678, 'key', 'salt'))
                    .rejects.toThrow();
            } finally {
                pool.connect = originalConnect;
            }
        });
    });

    describe('rotateOdooUserKey edge cases', () => {
        test('rotateOdooUserKey should throw when old key is already revoked', async () => {
            // Set and then revoke credentials
            const keyId = await db.setUserOdooCredentials(testUser, 1234, 5678, 'initial_key', 'initial_salt');
            await db.revokeUserOdooCredentials(testUser);

            // Try to rotate using the revoked key
            await expect(db.rotateOdooUserKey(testUser.user_id, keyId, 'new_key', 'new_salt'))
                .rejects.toThrow();
        });

        test('rotateOdooUserKey should throw when INSERT fails', async () => {
            // First set credentials
            const keyId = await db.setUserOdooCredentials(testUser, 1234, 5678, 'initial_key', 'initial_salt');

            // Mock pool.connect to fail on INSERT
            const originalConnect = pool.connect;
            pool.connect = jest.fn().mockImplementation(() => {
                const mockClient = {
                    query: jest.fn()
                        .mockResolvedValueOnce({}) // BEGIN
                        .mockResolvedValueOnce({rows: [{revoked_at: null}], rowCount: 1}) // UPDATE (revoke)
                        .mockResolvedValueOnce({rows: [], rowCount: 0}), // INSERT (fails)
                    release: jest.fn()
                };
                return Promise.resolve(mockClient);
            });

            try {
                await expect(db.rotateOdooUserKey(testUser.user_id, keyId, 'new_key', 'new_salt'))
                    .rejects.toThrow();
            } finally {
                pool.connect = originalConnect;
            }
        });
    });

    describe('setSteveUserParamaters edge cases', () => {
        test('setSteveUserParamaters should throw when update fails', async () => {
            const fakeUser = {user_id: 999999};

            await expect(db.setSteveUserParamaters(fakeUser, 5555))
                .rejects.toThrow(DatabaseError);

        });
    });

    describe('setLastStopTimestamp edge cases', () => {
        test('setLastStopTimestamp should throw when watermark is invalid', async () => {
            await expect(db.setLastStopTimestamp(null))
                .rejects.toThrow(ValidationError);

            await expect(db.setLastStopTimestamp(DateTime.invalid('invalid')))
                .rejects.toThrow(ValidationError);

            await expect(db.setLastStopTimestamp('not a datetime'))
                .rejects.toThrow(ValidationError);
        });
    });

    describe('saveInvoiceId validation', () => {
        test('saveInvoiceId should throw when transaction format is invalid', async () => {
            const invalidTxn = {id: 'not_a_number'};

            await expect(db.saveInvoiceId(invalidTxn, 12345))
                .rejects.toThrow(ValidationError);
        });
    });
});
