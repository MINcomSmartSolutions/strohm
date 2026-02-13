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
    // Update prices from cents to euros (divide by 100)
    pgm.sql(`
        UPDATE electricity_prices
        SET price = price / 100;
    `);

    //change the column name to price_eur_kwh to reflect the new unit
    pgm.renameColumn('electricity_prices', 'price', 'price_eur_kwh');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
    // Revert column name
    pgm.renameColumn('electricity_prices', 'price_eur_kwh', 'price');

    // Update prices from euros back to cents (multiply by 100)
    pgm.sql(`
        UPDATE electricity_prices
        SET price = price * 100;
    `);
};
