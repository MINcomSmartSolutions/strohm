/**
 * @file Integration tests for database queries
 */
const {DateTime} = require('luxon');
const {
    setupTestDatabase,
    clearTestData,
    insertTestUser,
    insertOdooCredentials,
    insertTestTransaction,
    insertElectricityPrice,
    closePool,
    teardownTestEnvironment,
} = require('./utils/db-setup');

// Create a mock pool that will be properly initialized in beforeAll
let mockPool;

// Override database connection with test connection
jest.mock('../../services/db_conn', () => {
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
const {db} = require('../../utils/queries');
const {ValidationError, ErrorCodes} = require('../../utils/errors');

describe('Database Queries Integration Tests', () => {
    let pool;
    let testUser;

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
            expect(newUser.rfid).toBe('new_rfid');
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

            // Test with null filter
            await expect(db.getUserUnique(null))
                .rejects.toThrow(ValidationError);
        });

        test('getUserUnique should throw if multiple users match', async () => {
            // Create users with the same email for testing
            await db.createUser(
                'duplicate1',
                'Duplicate User 1',
                'duplicate@example.com',
                'rfid1',
            );

            await db.createUser(
                'duplicate2',
                'Duplicate User 2',
                'duplicate@example.com',
                'rfid2',
            );

            // Should throw because multiple users have the same email
            await expect(db.getUserUnique({email: 'duplicate@example.com'}))
                .rejects.toThrow();
        });

        test('deactivateUser should set deactivated_at timestamp', async () => {
            // Deactivate the test user
            await db.deactivateUser(testUser);

            // Fetch the user again
            const deactivatedUser = await db.getUserUnique({user_id: testUser.user_id});

            expect(deactivatedUser).toBeDefined();
            expect(deactivatedUser.deactivated_at).toBeDefined();
            expect(deactivatedUser.deactivated_at).not.toBeNull();

            // Try to deactivate an invalid user
            await expect(db.deactivateUser(null))
                .rejects.toThrow(ValidationError);

            await expect(db.deactivateUser({}))
                .rejects.toThrow(ValidationError);
        });

        test('deactivateUser should record activity log entry', async () => {
            // Deactivate the test user
            await db.deactivateUser(testUser);

            // Verify activity log entry
            const client = await pool.connect();
            try {
                const result = await client.query(
                    'SELECT * FROM activity_log WHERE user_id = $1 AND event_type = $2',
                    [testUser.user_id, 'DEACTIVATE USER'],
                );
                expect(result.rows.length).toBe(1);
                expect(result.rows[0].target).toBe('DB');
                expect(result.rows[0].rfid).toBe(testUser.rfid);
            } finally {
                client.release();
            }
        });
    });

    describe('Odoo Credentials', () => {
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

        test('getUserOdooCredentials should throw when missing user_id', async () => {
            await expect(db.getUserOdooCredentials(null))
                .rejects.toThrow(ValidationError);
        });

        test('rotateOdooUserKey should revoke old key and create new one', async () => {
            // First, set initial credentials
            await db.setUserOdooCredentials(
                testUser,
                1234,
                5678,
                'initial_key',
                'initial_salt',
            );

            // Get initial credentials
            const initialCreds = await db.getUserOdooCredentials(testUser.user_id);

            // Rotate key
            await db.rotateOdooUserKey(
                testUser.user_id,
                initialCreds.key_id,
                'rotated_key',
                'rotated_salt',
            );

            // Get new credentials
            const newCreds = await db.getUserOdooCredentials(testUser.user_id);

            expect(newCreds).toBeDefined();
            expect(newCreds.key).toBe('rotated_key');
            expect(newCreds.key_salt).toBe('rotated_salt');
            expect(newCreds.key_id).not.toBe(initialCreds.key_id);

            // Verify old key is revoked
            const client = await pool.connect();
            try {
                const result = await client.query(
                    'SELECT revoked_at FROM odoo_apikeys WHERE id = $1',
                    [initialCreds.key_id],
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

    describe('Transaction Operations', () => {
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
            expect(savedTx.tx_steve_id).toBe(12345);
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
            expect(savedTx.tx_steve_id).toBe(12346);
            expect(savedTx.user_id).toBeNull(); // No user association
            expect(savedTx.ocpp_id_tag).toBe('unknown_rfid');
        });

        test('recordTransaction should update an existing transaction', async () => {
            // First, create a transaction
            const now = new Date();
            const startTime = new Date(now.getTime() - 3600000);

            const steveTransaction = {
                id: 54321,
                connectorId: 1,
                chargeBoxPk: 100,
                ocppTagPk: 1000,
                chargeBoxId: 'TEST-CHARGER-01',
                ocppIdTag: testUser.rfid,
                startTimestamp: startTime.toISOString(),
                stopTimestamp: now.toISOString(),
                startValue: 0,
                stopValue: 10,
                stopReason: 'Remote',
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
            expect(saved.tx_steve_id).toBe(54321);
            expect(Number(saved.stop_value)).toBe(20);
            expect(Number(saved.delivered_energy_wh)).toBe(20);
        });

        test('recordTransaction should return existing transaction if stop timestamp matches', async () => {
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
                startValue: 0,
                stopValue: 10,
                stopReason: 'Remote',
                stopEventActor: 'manual',
            };

            // Create initial transaction
            const initialTx = await db.recordTransaction(steveTransaction);

            // Try to save the same transaction again
            const savedAgainTx = await db.recordTransaction(steveTransaction);

            // Should be the same record, not a new one
            expect(savedAgainTx.id).toBe(initialTx.id);
            expect(savedAgainTx.tx_steve_id).toBe(initialTx.tx_steve_id);
        });

        test('saveInvoiceId should link an invoice to a transaction', async () => {
            // First create a transaction
            const tx = await insertTestTransaction(pool, testUser);

            // Link invoice
            await db.saveInvoiceId(tx, 98765);

            // Verify link
            const client = await pool.connect();
            try {
                const result = await client.query(
                    'SELECT invoice_ref FROM charging_transactions WHERE id = $1',
                    [tx.id],
                );

                expect(result.rows[0].invoice_ref).toBe(98765);
            } finally {
                client.release();
            }
        });
    });

    describe('Electricity Price', () => {
        test('getCurrentElectricityPrice should return current price', async () => {
            // Insert test price
            await insertElectricityPrice(pool);

            const price = await db.getCurrentElectricityPrice();

            expect(price).toBeDefined();
            expect(price).toBe(35);
        });

        test('getCurrentElectricityPrice should return price for specific date', async () => {
            // Insert test price
            await insertElectricityPrice(pool);

            const yesterdayDate = DateTime.now().minus({days: 1});
            const price = await db.getCurrentElectricityPrice(yesterdayDate);

            expect(price).toBeDefined();
            expect(price).toBe(35);
        });

        test('getCurrentElectricityPrice should throw when no valid price exists', async () => {
            // No price inserted
            await expect(db.getCurrentElectricityPrice())
                .rejects.toThrow();
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

                // Check current price (should be 35)
                const currentPrice = await db.getCurrentElectricityPrice();
                expect(currentPrice).toBe(35);
            } finally {
                client.release();
            }
        });
    });

    describe('Watermark', () => {
        test('setLastStopTimestamp and getLastStopTimestamp should work', async () => {
            const testDate = new Date();

            // Set watermark
            await db.setLastStopTimestamp(testDate);

            // Get watermark
            const watermark = await db.getLastStopTimestamp();

            expect(watermark).toBeDefined();
            expect(watermark.toJSDate().getTime()).toBeCloseTo(testDate.getTime(), -3); // Allow small difference due to DB conversion
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
            const initialDate = new Date('2025-01-01T12:00:00Z');

            await db.setLastStopTimestamp(initialDate);

            await db.setLastStopTimestamp(initialDate);

            await db.setLastStopTimestamp(initialDate);

            // Get the watermark
            const watermark = await db.getLastStopTimestamp();

            // Should be the new date
            expect(watermark.toJSDate().getTime()).toBeCloseTo(initialDate.getTime(), -3);

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
});
