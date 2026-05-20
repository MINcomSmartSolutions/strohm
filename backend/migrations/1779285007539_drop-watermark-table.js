/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * Migration: Drop watermark table
 *
 * The watermark-based transaction fetching has been replaced with a simpler
 * sliding window approach that queries the last N minutes on each cycle.
 * The watermark table is no longer used.
 *
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
    pgm.dropTable('watermark');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
    pgm.createTable('watermark', {
        id: {type: 'serial', primaryKey: true},
        last_stop_timestamp: {type: 'timestamptz', notNull: true, unique: true},
        created_at: {type: 'timestamptz', notNull: true, default: pgm.func('NOW()')},
        iterated_at: {type: 'timestamptz'},
    });
};
