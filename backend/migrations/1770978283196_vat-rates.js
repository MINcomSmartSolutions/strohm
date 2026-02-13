/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
    pgm.createTable('vat_rates', {
        id: 'id',
        rate: {type: 'smallint', notNull: true,},
        description: {type: 'text', notNull: false,},
        effective_from: {type: 'timestamp with time zone', notNull: true,},
        effective_to: {type: 'timestamp with time zone', notNull: false,},
        created_at: {type: 'timestamp with time zone', notNull: true, default: pgm.func('CURRENT_TIMESTAMP'),},
        updated_at: {type: 'timestamp with time zone', notNull: false,},
    });
    pgm.addConstraint('vat_rates', 'vat_rates_rate_unique', {
        unique: ['rate', 'effective_from', 'effective_to'],
    });
    pgm.sql(`
        INSERT INTO vat_rates (rate, description, effective_from)
        VALUES (19, 'Standard MWSt.', '2025-01-01');
    `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
    pgm.dropTable('vat_rates');
};
