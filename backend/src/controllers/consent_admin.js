/**
 * @file Admin controller for consent management (PDF upload).
 * Protected by Tailscale network authentication.
 *
 * @module controllers/consent_admin
 */

const multer = require('multer');
const logger = require('#services/logger');
const {
    createConsentRevision,
    validateAndSanitizePdf,
    getAllActiveConsentRevisions,
    CONSENT_TYPES,
    MAX_PDF_SIZE,
} = require('#services/consent');

// Multer config: memory storage, 10MB limit, PDF only
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {fileSize: MAX_PDF_SIZE},
    fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
            return cb(new Error('Nur PDF-Dateien sind erlaubt'));
        }
        cb(null, true);
    },
});

/**
 * GET /api/dev/consent/revisions - Get current active consent revisions
 */
async function getConsentRevisions(req, res) {
    try {
        const revisions = await getAllActiveConsentRevisions();
        res.json({
            success: true,
            data: revisions.map(r => ({
                id: r.id,
                version: r.version,
                title: r.title,
                consent_type: r.consent_type,
                pdf_filename: r.pdf_filename,
                pdf_size: r.pdf_size,
                created_at: r.created_at,
                updated_at: r.updated_at,
            })),
        });
    } catch (error) {
        logger.error('Error fetching consent revisions:', error);
        res.status(500).json({success: false, error: error.message || 'Failed to fetch consent revisions'});
    }
}

/**
 * POST /api/dev/consent/upload - Upload a new consent PDF
 *
 * Body (multipart/form-data):
 * - pdf: PDF file (required, max 10MB)
 * - consent_type: 'agb' or 'datenschutz' (required)
 * - version: version string (required)
 * - title: document title (required)
 */
async function uploadConsentPdf(req, res) {
    // Use multer middleware inline
    upload.single('pdf')(req, res, async (multerErr) => {
        try {
            if (multerErr) {
                if (multerErr.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({
                        success: false,
                        error: `Die Datei ist zu groß. Maximale Größe: ${MAX_PDF_SIZE / 1024 / 1024}MB`,
                    });
                }
                return res.status(400).json({success: false, error: multerErr.message});
            }

            if (!req.file) {
                return res.status(400).json({success: false, error: 'Keine PDF-Datei hochgeladen'});
            }

            const {consent_type, version, title} = req.body;

            // Validate required fields
            if (!consent_type || !version || !title) {
                return res.status(400).json({
                    success: false,
                    error: 'consent_type, version und title sind erforderlich',
                });
            }

            // Validate consent_type
            if (!Object.values(CONSENT_TYPES).includes(consent_type)) {
                return res.status(400).json({
                    success: false,
                    error: `Ungültiger consent_type. Erlaubt: ${Object.values(CONSENT_TYPES).join(', ')}`,
                });
            }

            // Validate version format (basic sanity check)
            if (version.length > 50 || !/^[\w.]+$/.test(version)) {
                return res.status(400).json({
                    success: false,
                    error: 'Ungültiges Versionsformat (max 50 Zeichen, nur Buchstaben, Zahlen, Punkte, Unterstriche)',
                });
            }

            if (title.length > 255) {
                return res.status(400).json({
                    success: false,
                    error: 'Titel darf maximal 255 Zeichen lang sein',
                });
            }

            const safeFileName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

            // Validate and sanitize the PDF (magic bytes?, re-serialize to strip JS)
            const sanitizedPdf = await validateAndSanitizePdf(req.file.buffer, safeFileName);

            // Store in database
            const revision = await createConsentRevision(
                version,
                title,
                null, // no text content for PDF-based consents
                consent_type,
                sanitizedPdf,
                safeFileName,
                sanitizedPdf.length,
                'application/pdf',
            );

            logger.info(`Admin uploaded new consent PDF: type=${consent_type}, version=${version}, file=${safeFileName}`);

            res.json({
                success: true,
                message: `Neue ${consent_type.toUpperCase()} Einwilligung v${version} erfolgreich hochgeladen`,
                data: {
                    id: revision.id,
                    version: revision.version,
                    consent_type: revision.consent_type,
                    pdf_filename: revision.pdf_filename,
                    pdf_size: revision.pdf_size,
                },
            });
        } catch (error) {
            logger.error('Error uploading consent PDF:', error);
            res.status(error.statusCode || 500).json({
                success: false,
                error: error.message || 'Fehler beim Hochladen der PDF',
            });
        }
    });
}

module.exports = {
    getConsentRevisions,
    uploadConsentPdf,
};
