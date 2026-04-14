/**
 * @file Unit tests for consent service
 */
const {
    getActiveConsentRevision,
    getAllActiveConsentRevisions,
    getConsentPdf,
    hasValidConsent,
    hasLatestConsent,
    recordConsent,
    withdrawConsent,
    getUserConsentHistory,
    createConsentRevision,
    validateAndSanitizePdf,
    CONSENT_TYPES,
    MAX_PDF_SIZE,
} = require('#services/consent');
const pool = require('#services/db_conn');
const logger = require('#services/logger');
const {db} = require('#utils/queries');

// Mock dependencies
jest.mock('#services/db_conn');
jest.mock('#services/logger');
jest.mock('#utils/queries');
jest.mock('pdf-lib', () => ({
    PDFDocument: {
        load: jest.fn(),
    },
}));

describe('Consent Service', () => {
    let mockClient;
    const user = {
        user_id: 111,
        oauth_id: 'auth0|1234567890',
        email: 'test@example.com',
        created_at: new Date(),
        deactivated_at: null,
        steve_id: 1,
        rfid: 'RFID123'
    }

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
                title: 'AGB',
                content: null,
                consent_type: 'agb',
                pdf_filename: 'agb.pdf',
                pdf_size: 12345,
                pdf_content_type: 'application/pdf',
                privacy_policy_url: null,
                terms_url: null,
                created_at: '2025-01-01T00:00:00Z',
                expires_at: null,
            };

            mockClient.query.mockResolvedValue({rows: [mockConsent]});

            const result = await getActiveConsentRevision();

            expect(result).toEqual(mockConsent);
            expect(mockClient.release).toHaveBeenCalled();
        });

        it('should filter by consent type when provided', async () => {
            const mockConsent = {id: 1, consent_type: 'agb'};
            mockClient.query.mockResolvedValue({rows: [mockConsent]});

            const result = await getActiveConsentRevision(CONSENT_TYPES.AGB);

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('AND consent_type = $1'),
                [CONSENT_TYPES.AGB]
            );
            expect(result).toEqual(mockConsent);
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
        it('should return true when user has consented to the single latest revision', async () => {
            mockClient.query
                .mockResolvedValueOnce({rows: [{id: 1, consent_type: 'agb'}]}) // DISTINCT ON query
                .mockResolvedValueOnce({rows: [{id: 1}]});                      // user consent for agb

            const result = await hasLatestConsent(user);

            expect(mockClient.query).toHaveBeenCalledTimes(2);
            expect(result).toBe(true);
            expect(mockClient.release).toHaveBeenCalled();
        });

        it('should return true when user has consented to all required revisions (agb + datenschutz)', async () => {
            mockClient.query
                .mockResolvedValueOnce({rows: [{id: 1, consent_type: 'agb'}, {id: 2, consent_type: 'datenschutz'}]})
                .mockResolvedValueOnce({rows: [{id: 1}]}) // consent for agb
                .mockResolvedValueOnce({rows: [{id: 2}]}); // consent for datenschutz

            const result = await hasLatestConsent(user);

            expect(mockClient.query).toHaveBeenCalledTimes(3);
            expect(result).toBe(true);
        });

        it('should return false when no active consent revisions exist', async () => {
            mockClient.query.mockResolvedValueOnce({rows: []});

            const result = await hasLatestConsent(user);

            expect(result).toBe(false);
            expect(mockClient.release).toHaveBeenCalled();
        });

        it('should return false when user has not consented to one of the required revisions', async () => {
            mockClient.query
                .mockResolvedValueOnce({rows: [{id: 1, consent_type: 'agb'}, {id: 2, consent_type: 'datenschutz'}]})
                .mockResolvedValueOnce({rows: [{id: 1}]}) // consent for agb found
                .mockResolvedValueOnce({rows: []});        // consent for datenschutz missing

            const result = await hasLatestConsent(user);

            expect(result).toBe(false);
        });

        it('should return false when user has not consented to the single latest revision', async () => {
            mockClient.query
                .mockResolvedValueOnce({rows: [{id: 1, consent_type: 'agb'}]})
                .mockResolvedValueOnce({rows: []});

            const result = await hasLatestConsent(user);

            expect(result).toBe(false);
            expect(mockClient.release).toHaveBeenCalled();
        });

        it('should throw when user object is invalid', async () => {
            await expect(hasLatestConsent(null)).rejects.toThrow();
            await expect(hasLatestConsent({})).rejects.toThrow();
        });

        it('should handle database errors gracefully', async () => {
            const error = new Error('Query failed');
            mockClient.query.mockRejectedValue(error);

            await hasLatestConsent(user);

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
        const title = 'Allgemeine Geschäftsbedingungen';
        const consentType = CONSENT_TYPES.AGB;
        const pdfBuffer = Buffer.from('%PDF-fake');
        const pdfFilename = 'agb.pdf';
        const pdfSize = pdfBuffer.length;
        const pdfContentType = 'application/pdf';

        const mockRevision = {
            id: 2,
            version,
            title,
            consent_type: consentType,
            pdf_filename: pdfFilename,
            pdf_size: pdfSize,
            pdf_content_type: pdfContentType,
            created_at: '2025-01-01T00:00:00Z',
            expires_at: null,
            is_active: true,
            optional: false,
        };

        it('should create a new consent revision with PDF data', async () => {
            mockClient.query
                .mockResolvedValueOnce()                        // BEGIN
                .mockResolvedValueOnce()                        // deactivate previous
                .mockResolvedValueOnce({rows: [mockRevision]}) // INSERT
                .mockResolvedValueOnce();                       // COMMIT

            const result = await createConsentRevision(
                version, title, null, consentType,
                pdfBuffer, pdfFilename, pdfSize, pdfContentType
            );

            expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
            expect(mockClient.query).toHaveBeenCalledWith(
                'UPDATE consent_revisions SET is_active = false WHERE is_active = true AND consent_type = $1',
                [consentType]
            );
            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO consent_revisions'),
                [version, title, null, consentType, pdfBuffer, pdfFilename, pdfSize, pdfContentType,
                    null, null, null, false]
            );
            expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
            expect(result).toEqual(mockRevision);
            expect(logger.info).toHaveBeenCalledWith(
                `New consent revision created: ${version} (type: ${consentType})`
            );
            expect(mockClient.release).toHaveBeenCalled();
        });

        it('should throw when PDF data is not provided', async () => {
            await expect(createConsentRevision(version, title, null))
                .rejects.toThrow('PDF data is required for creating a consent revision');
        });

        it('should throw when PDF data is empty', async () => {
            await expect(createConsentRevision(version, title, null, CONSENT_TYPES.AGB, Buffer.alloc(0)))
                .rejects.toThrow('PDF data is required for creating a consent revision');
        });

        it('should throw when consent type is invalid', async () => {
            await expect(createConsentRevision(version, title, null, 'invalid_type', pdfBuffer, pdfFilename, pdfSize, pdfContentType))
                .rejects.toThrow('Invalid consent type: invalid_type');
        });

        it('should only deactivate revisions of the same consent_type', async () => {
            mockClient.query
                .mockResolvedValueOnce()
                .mockResolvedValueOnce()
                .mockResolvedValueOnce({rows: [mockRevision]})
                .mockResolvedValueOnce();

            await createConsentRevision(version, title, null, CONSENT_TYPES.DATENSCHUTZ, pdfBuffer, pdfFilename, pdfSize, pdfContentType);

            expect(mockClient.query).toHaveBeenCalledWith(
                'UPDATE consent_revisions SET is_active = false WHERE is_active = true AND consent_type = $1',
                [CONSENT_TYPES.DATENSCHUTZ]
            );
        });

        it('should rollback transaction on error', async () => {
            const error = new Error('Insert failed');
            mockClient.query
                .mockResolvedValueOnce()       // BEGIN
                .mockResolvedValueOnce()       // deactivate
                .mockRejectedValueOnce(error); // INSERT fails

            await createConsentRevision(version, title, null, CONSENT_TYPES.AGB, pdfBuffer, pdfFilename, pdfSize, pdfContentType);

            expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
            expect(db.handleQueryError).toHaveBeenCalledWith(error, 'createConsentRevision');
            expect(mockClient.release).toHaveBeenCalled();
        });
    });

    describe('getAllActiveConsentRevisions', () => {
        it('should return all active revisions (one per type)', async () => {
            const mockRevisions = [
                {id: 1, consent_type: 'agb', version: '1.0', title: 'AGB', pdf_filename: 'agb.pdf'},
                {id: 2, consent_type: 'datenschutz', version: '1.0', title: 'Datenschutz', pdf_filename: 'ds.pdf'},
            ];
            mockClient.query.mockResolvedValue({rows: mockRevisions});

            const result = await getAllActiveConsentRevisions();

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('DISTINCT ON (consent_type)')
            );
            expect(result).toEqual(mockRevisions);
            expect(mockClient.release).toHaveBeenCalled();
        });

        it('should return empty array when no active revisions exist', async () => {
            mockClient.query.mockResolvedValue({rows: []});

            const result = await getAllActiveConsentRevisions();

            expect(result).toEqual([]);
        });

        it('should handle database errors gracefully', async () => {
            const error = new Error('Query failed');
            mockClient.query.mockRejectedValue(error);

            await getAllActiveConsentRevisions();

            expect(db.handleQueryError).toHaveBeenCalledWith(error, 'getAllActiveConsentRevisions');
            expect(mockClient.release).toHaveBeenCalled();
        });
    });

    describe('getConsentPdf', () => {
        it('should return PDF data when revision has a PDF', async () => {
            const mockPdf = {
                pdf_data: Buffer.from('%PDF-fake'),
                pdf_filename: 'agb.pdf',
                pdf_content_type: 'application/pdf',
                pdf_size: 9,
            };
            mockClient.query.mockResolvedValue({rows: [mockPdf]});

            const result = await getConsentPdf(1);

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('pdf_data IS NOT NULL'),
                [1]
            );
            expect(result).toEqual(mockPdf);
            expect(mockClient.release).toHaveBeenCalled();
        });

        it('should return null when revision has no PDF', async () => {
            mockClient.query.mockResolvedValue({rows: []});

            const result = await getConsentPdf(99);

            expect(result).toBeNull();
        });

        it('should handle database errors gracefully', async () => {
            const error = new Error('Query failed');
            mockClient.query.mockRejectedValue(error);

            await getConsentPdf(1);

            expect(db.handleQueryError).toHaveBeenCalledWith(error, 'getConsentPdf');
            expect(mockClient.release).toHaveBeenCalled();
        });
    });

    describe('validateAndSanitizePdf', () => {
        const {PDFDocument} = require('pdf-lib');
        const validPdfHeader = Buffer.from('%PDF-1.4 fake content');

        beforeEach(() => {
            PDFDocument.load.mockReset();
        });

        it('should throw when buffer is empty', async () => {
            await expect(validateAndSanitizePdf(Buffer.alloc(0), 'test.pdf'))
                .rejects.toThrow('PDF file is empty');
        });

        it('should throw when buffer exceeds max size', async () => {
            const oversized = Buffer.alloc(MAX_PDF_SIZE + 1);
            oversized.write('%PDF', 0);
            await expect(validateAndSanitizePdf(oversized, 'big.pdf'))
                .rejects.toThrow(/exceeds maximum size/);
        });

        it('should throw when magic bytes are invalid', async () => {
            const notPdf = Buffer.from('notapdf content here');
            await expect(validateAndSanitizePdf(notPdf, 'fake.pdf'))
                .rejects.toThrow('Invalid PDF file: missing PDF header');
        });

        it('should return sanitized buffer for a valid PDF', async () => {
            const mockCatalog = {
                has: jest.fn().mockReturnValue(false),
                delete: jest.fn(),
            };
            const mockPdfDoc = {
                catalog: mockCatalog,
                context: {obj: jest.fn().mockReturnValue('key')},
                save: jest.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
            };
            PDFDocument.load.mockResolvedValue(mockPdfDoc);

            const result = await validateAndSanitizePdf(validPdfHeader, 'agb.pdf');

            expect(PDFDocument.load).toHaveBeenCalledWith(validPdfHeader, expect.any(Object));
            expect(Buffer.isBuffer(result)).toBe(true);
        });

        it('should throw ValidationError when pdf-lib fails to parse', async () => {
            PDFDocument.load.mockRejectedValue(new Error('corrupted'));

            await expect(validateAndSanitizePdf(validPdfHeader, 'bad.pdf'))
                .rejects.toThrow('Invalid or corrupted PDF file');
        });
    });
});
