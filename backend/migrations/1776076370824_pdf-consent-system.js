/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * Migration: PDF-based consent system
 *
 * Changes:
 * - Add consent_type column to consent_revisions ('agb' or 'datenschutz')
 * - Add PDF storage columns (pdf_data as BYTEA, pdf_filename, pdf_size, pdf_content_type)
 * - Make content column nullable (PDFs replace text content)
 * - Update unique constraint from version alone to (version, consent_type)
 *
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
    // Add consent_type column with check constraint
    pgm.addColumn('consent_revisions', {
        consent_type: {
            type: 'varchar(20)',
            notNull: true,
            default: 'agb',
            check: "consent_type IN ('agb', 'datenschutz')",
        },
    });

    // Add PDF storage columns
    pgm.addColumn('consent_revisions', {
        pdf_data: {type: 'bytea', notNull: false},
        pdf_filename: {type: 'varchar(255)', notNull: false},
        pdf_size: {type: 'integer', notNull: false},
        pdf_content_type: {type: 'varchar(100)', notNull: false},
    });

    // Make content nullable (PDFs replace text content)
    pgm.alterColumn('consent_revisions', 'content', {
        notNull: false,
    });

    // Drop old unique constraint on version alone
    pgm.dropConstraint('consent_revisions', 'consent_revisions_version_key');

    // Add new unique constraint on (version, consent_type)
    pgm.addConstraint('consent_revisions', 'consent_revisions_version_type_unique', {
        unique: ['version', 'consent_type'],
    });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
    pgm.dropConstraint('consent_revisions', 'consent_revisions_version_type_unique');
    pgm.addConstraint('consent_revisions', 'consent_revisions_version_key', {
        unique: ['version'],
    });

    // Populate NULL content values with empty string before making column NOT NULL
    // This prevents rollback failures when pdf_data is used instead of content
    pgm.sql("UPDATE consent_revisions SET content = '' WHERE content IS NULL;");

    pgm.alterColumn('consent_revisions', 'content', {
        notNull: true,
    });
    pgm.dropColumn('consent_revisions', ['pdf_data', 'pdf_filename', 'pdf_size', 'pdf_content_type']);
    pgm.dropColumn('consent_revisions', 'consent_type');
};
