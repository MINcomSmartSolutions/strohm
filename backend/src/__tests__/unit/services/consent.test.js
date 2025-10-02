/**
 * @file Unit tests for consent service
 */
const {
    getActiveConsentRevision,
    hasValidConsent,
    hasLatestConsent,
    recordConsent,
    withdrawConsent,
    getUserConsentHistory,
    createConsentRevision
} = require('#services/consent');
const pool = require('#services/db_conn');
const logger = require('#services/logger');
const {db} = require('#utils/queries');

// Mock dependencies
jest.mock('#services/db_conn');
jest.mock('#services/logger');
jest.mock('#utils/queries');

describe('Consent Service', () => {
    let mockClient;

    beforeEach(() => {
        jest.clearAllMocks();

        mockClient = {
            query: jest.fn(),
            release: jest.fn(),
        };

        pool.connect.mockResolvedValue(mockClient);
        logger.info = jest.fn();
        logger.error = jest.fn();
    });

    describe('getActiveConsentRevision', () => {
        it('should return active consent revision when one exists', async () => {
            const mockConsent = {
                id: 1,
                version: '1.0',
                title: 'Privacy Policy',
                content: 'Test content',
                privacy_policy_url: 'https://example.com/privacy',
                terms_url: 'https://example.com/terms',
                created_at: '2025-01-01T00:00:00Z',
                expires_at: null
            };

            mockClient.query.mockResolvedValue({rows: [mockConsent]});

            const result = await getActiveConsentRevision();


            expect(result).toEqual(mockConsent);
            expect(mockClient.release).toHaveBeenCalled();
        });

        it('should return null when no active consent revision exists', async () => {
            mockClient.query.mockResolvedValue({rows: []});

            const result = await getActiveConsentRevision();

            expect(result).toBeNull();
            expect(mockClient.release).toHaveBeenCalled();
        });

        it('should handle database errors gracefully', async () => {
            const error = new Error('Database connection failed');
            mockClient.query.mockRejectedValue(error);

            await getActiveConsentRevision();

            expect(db.handleQueryError).toHaveBeenCalledWith(error, 'getActiveConsentRevision');
            expect(mockClient.release).toHaveBeenCalled();
        });
    });

    describe('hasValidConsent', () => {
        const userId = 123;

        it('should return true when user has valid consent', async () => {
            mockClient.query.mockResolvedValue({rows: [{id: 1}]});

            const result = await hasValidConsent(userId);

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('FROM user_consents uc'),
                [userId]
            );
            expect(result).toBe(true);
            expect(mockClient.release).toHaveBeenCalled();
        });

        it('should return false when user has no valid consent', async () => {
            mockClient.query.mockResolvedValue({rows: []});

            const result = await hasValidConsent(userId);

            expect(result).toBe(false);
            expect(mockClient.release).toHaveBeenCalled();
        });

        it('should handle database errors gracefully', async () => {
            const error = new Error('Query failed');
            mockClient.query.mockRejectedValue(error);

            await hasValidConsent(userId);

            expect(db.handleQueryError).toHaveBeenCalledWith(error, 'hasValidConsent');
            expect(mockClient.release).toHaveBeenCalled();
        });
    });

    describe('hasLatestConsent', () => {
        const userId = 123;

        it('should return true when user has consented to latest revision', async () => {
            mockClient.query
                .mockResolvedValueOnce({rows: [{id: 1}]}) // Latest revision query
                .mockResolvedValueOnce({rows: [{id: 1}]}); // User consent query

            const result = await hasLatestConsent(userId);

            expect(mockClient.query).toHaveBeenCalledTimes(2);
            expect(result).toBe(true);
            expect(mockClient.release).toHaveBeenCalled();
        });

        it('should return false when no active consent revision exists', async () => {
            mockClient.query.mockResolvedValueOnce({rows: []}); // No latest revision

            const result = await hasLatestConsent(userId);

            expect(result).toBe(false);
            expect(mockClient.release).toHaveBeenCalled();
        });

        it('should return false when user has not consented to latest revision', async () => {
            mockClient.query
                .mockResolvedValueOnce({rows: [{id: 1}]}) // Latest revision exists
                .mockResolvedValueOnce({rows: []}); // User has not consented

            const result = await hasLatestConsent(userId);

            expect(result).toBe(false);
            expect(mockClient.release).toHaveBeenCalled();
        });

        it('should handle database errors gracefully', async () => {
            const error = new Error('Query failed');
            mockClient.query.mockRejectedValue(error);

            await hasLatestConsent(userId);

            expect(db.handleQueryError).toHaveBeenCalledWith(error, 'hasLatestConsent');
            expect(mockClient.release).toHaveBeenCalled();
        });
    });

    describe('recordConsent', () => {
        const userId = 123;
        const consentRevisionId = 1;
        const ipAddress = '192.168.1.1';
        const userAgent = 'Mozilla/5.0';
        const consentMethod = 'web_form';

        it('should successfully record consent', async () => {
            const mockConsentRecord = {
                id: 1,
                user_id: userId,
                consent_revision_id: consentRevisionId,
                consented_at: '2025-01-01T00:00:00Z',
                ip_address: ipAddress,
                user_agent: userAgent,
                consent_method: consentMethod
            };

            mockClient.query
                .mockResolvedValueOnce() // BEGIN
                .mockResolvedValueOnce({rows: [mockConsentRecord]}) // INSERT
                .mockResolvedValueOnce(); // COMMIT

            const result = await recordConsent(userId, consentRevisionId, ipAddress, userAgent);

            expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO user_consents'),
                [userId, consentRevisionId, ipAddress, userAgent, consentMethod]
            );
            expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
            expect(result).toEqual(mockConsentRecord);
            expect(logger.info).toHaveBeenCalledWith(
                `Consent recorded for user ${userId} with revision ${consentRevisionId}`
            );
            expect(mockClient.release).toHaveBeenCalled();
        });

        it('should use default consent method when not provided', async () => {
            const mockConsentRecord = {id: 1};
            mockClient.query
                .mockResolvedValueOnce() // BEGIN
                .mockResolvedValueOnce({rows: [mockConsentRecord]}) // INSERT
                .mockResolvedValueOnce(); // COMMIT

            await recordConsent(userId, consentRevisionId, ipAddress, userAgent);

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO user_consents'),
                [userId, consentRevisionId, ipAddress, userAgent, 'web_form']
            );
        });

        it('should rollback transaction on error', async () => {
            const error = new Error('Insert failed');
            mockClient.query
                .mockResolvedValueOnce() // BEGIN
                .mockRejectedValueOnce(error); // INSERT fails

            await recordConsent(userId, consentRevisionId, ipAddress, userAgent);

            expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
            expect(db.handleQueryError).toHaveBeenCalledWith(error, 'recordConsent');
            expect(mockClient.release).toHaveBeenCalled();
        });
    });

    describe('withdrawConsent', () => {
        const userId = 123;

        it('should successfully withdraw consent when active consent exists', async () => {
            mockClient.query
                .mockResolvedValueOnce() // BEGIN
                .mockResolvedValueOnce({rows: [{id: 1}]}) // UPDATE returns affected rows
                .mockResolvedValueOnce(); // COMMIT

            const result = await withdrawConsent(userId);

            expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE user_consents'),
                [userId]
            );
            expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
            expect(result).toBe(true);
            expect(logger.info).toHaveBeenCalledWith(`Consent withdrawn for user ${userId}`);
            expect(mockClient.release).toHaveBeenCalled();
        });

        it('should return false when no active consent to withdraw', async () => {
            mockClient.query
                .mockResolvedValueOnce() // BEGIN
                .mockResolvedValueOnce({rows: []}) // UPDATE returns no affected rows
                .mockResolvedValueOnce(); // COMMIT

            const result = await withdrawConsent(userId);

            expect(result).toBe(false);
            expect(logger.info).not.toHaveBeenCalled();
            expect(mockClient.release).toHaveBeenCalled();
        });

        it('should rollback transaction on error', async () => {
            const error = new Error('Update failed');
            mockClient.query
                .mockResolvedValueOnce() // BEGIN
                .mockRejectedValueOnce(error); // UPDATE fails

            await withdrawConsent(userId);

            expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
            expect(db.handleQueryError).toHaveBeenCalledWith(error, 'withdrawConsent');
            expect(mockClient.release).toHaveBeenCalled();
        });
    });

    describe('getUserConsentHistory', () => {
        const userId = 123;

        it('should return user consent history', async () => {
            const mockHistory = [
                {
                    id: 1,
                    consented_at: '2025-01-01T00:00:00Z',
                    is_withdrawn: false,
                    withdrawn_at: null,
                    consent_method: 'web_form',
                    version: '1.0',
                    title: 'Privacy Policy'
                },
                {
                    id: 2,
                    consented_at: '2024-12-01T00:00:00Z',
                    is_withdrawn: true,
                    withdrawn_at: '2024-12-15T00:00:00Z',
                    consent_method: 'web_form',
                    version: '0.9',
                    title: 'Previous Privacy Policy'
                }
            ];

            mockClient.query.mockResolvedValue({rows: mockHistory});

            const result = await getUserConsentHistory(userId);

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('FROM user_consents uc'),
                [userId]
            );
            expect(result).toEqual(mockHistory);
            expect(mockClient.release).toHaveBeenCalled();
        });

        it('should return empty array when user has no consent history', async () => {
            mockClient.query.mockResolvedValue({rows: []});

            const result = await getUserConsentHistory(userId);

            expect(result).toEqual([]);
            expect(mockClient.release).toHaveBeenCalled();
        });

        it('should handle database errors gracefully', async () => {
            const error = new Error('Query failed');
            mockClient.query.mockRejectedValue(error);

            await getUserConsentHistory(userId);

            expect(db.handleQueryError).toHaveBeenCalledWith(error, 'getUserConsentHistory');
            expect(mockClient.release).toHaveBeenCalled();
        });
    });

    describe('createConsentRevision', () => {
        const version = '2.0';
        const title = 'Updated Privacy Policy';
        const content = 'Updated content';
        const privacyPolicyUrl = 'https://example.com/privacy';
        const termsUrl = 'https://example.com/terms';
        const expiresAt = new Date('2026-01-01');
        const optinal = false;

        it('should successfully create new consent revision with all parameters', async () => {
            const mockRevision = {
                id: 2,
                version,
                title,
                content,
                privacy_policy_url: privacyPolicyUrl,
                terms_url: termsUrl,
                created_at: '2025-01-01T00:00:00Z',
                expires_at: expiresAt,
                is_active: true,
                optinal: false
            };

            mockClient.query
                .mockResolvedValueOnce() // BEGIN
                .mockResolvedValueOnce() // Deactivate previous revisions
                .mockResolvedValueOnce({rows: [mockRevision]}) // INSERT new revision
                .mockResolvedValueOnce(); // COMMIT

            const result = await createConsentRevision(version, title, content, privacyPolicyUrl, termsUrl, expiresAt, optinal);

            expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
            expect(mockClient.query).toHaveBeenCalledWith(
                'UPDATE consent_revisions SET is_active = false WHERE is_active = true'
            );
            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO consent_revisions'),
                [version, title, content, privacyPolicyUrl, termsUrl, expiresAt, optinal]
            );
            expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
            expect(result).toEqual(mockRevision);
            expect(logger.info).toHaveBeenCalledWith(`New consent revision created: ${version}`);
            expect(mockClient.release).toHaveBeenCalled();
        });

        it('should create consent revision with only required parameters', async () => {
            const mockRevision = {
                id: 2,
                version,
                title,
                content,
                privacy_policy_url: null,
                terms_url: null,
                created_at: '2025-01-01T00:00:00Z',
                expires_at: null,
                is_active: true,
                optinal: false
            };

            mockClient.query
                .mockResolvedValueOnce() // BEGIN
                .mockResolvedValueOnce() // Deactivate previous revisions
                .mockResolvedValueOnce({rows: [mockRevision]}) // INSERT new revision
                .mockResolvedValueOnce(); // COMMIT

            const result = await createConsentRevision(version, title, content);

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO consent_revisions'),
                [version, title, content, null, null, null, false]
            );
            expect(result).toEqual(mockRevision);
        });

        it('should rollback transaction on error', async () => {
            const error = new Error('Insert failed');
            mockClient.query
                .mockResolvedValueOnce() // BEGIN
                .mockResolvedValueOnce() // Deactivate previous revisions
                .mockRejectedValueOnce(error); // INSERT fails

            await createConsentRevision(version, title, content);

            expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
            expect(db.handleQueryError).toHaveBeenCalledWith(error, 'createConsentRevision');
            expect(mockClient.release).toHaveBeenCalled();
        });
    });
});
