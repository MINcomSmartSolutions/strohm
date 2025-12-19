/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * Creates tables for Odoo integration with support for consolidated billing.
 * - odoo_txn_orders: Sale orders linked to charging transactions
 * - odoo_invoices: Invoices (can contain multiple orders)
 * - odoo_order_invoice_link: Junction table for many-to-many relationship
 *
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
    // Orders table - one per charging transaction
    pgm.createTable('odoo_txn_orders', {
        id: 'id',
        txn_id: {type: 'integer', notNull: true},
        odoo_saleorder_id: {type: 'integer', unique: true, notNull: true},
        odoo_saleorder_name: {type: 'varchar(100)'},
        qty: {type: 'float', comment: 'Quantity of electricity in kWh'},
        unit_price: {type: 'float', comment: 'Unit price per kWh when the order was created in euros/kWh'},
        total_amount: {type: 'float', comment: 'Total amount for the order. Could include taxes etc.'},
        confirmed: {type: 'boolean', notNull: true, default: true},
        billed: {type: 'boolean', notNull: true, default: false},
        cancelled: {type: 'boolean', notNull: true, default: false},
        deleted_at: {type: 'timestamp with time zone', comment: 'If set, indicates when the order was deleted in Odoo'},
        created_at: {type: 'timestamp with time zone', notNull: true, default: pgm.func('now()')},
    });

    // Invoices table - independent of orders, can contain multiple orders
    pgm.createTable('odoo_invoices', {
        id: 'id',
        odoo_invoice_id: {type: 'integer', notNull: true, unique: true},
        odoo_invoice_name: {type: 'varchar(100)'},
        total_amount: {type: 'float', comment: 'Total invoice amount. Could include taxes etc.'},
        paid: {type: 'boolean', notNull: true, default: false},
        cancelled: {type: 'boolean', notNull: true, default: false},
        created_at: {type: 'timestamp with time zone', notNull: true, default: pgm.func('now()')},
    });

    pgm.createTable('odoo_order_invoice_link', {
            id: 'id',
            order_id: {type: 'integer', notNull: true, comment: 'FK to odoo_txn_orders.id'},
            invoice_id: {type: 'integer', notNull: true, comment: 'FK to odoo_invoices.id'},
            created_at: {type: 'timestamp with time zone', notNull: true, default: pgm.func('now()')},
        }, {comment: 'Junction table for many-to-many relationship (so we can support consolidated billing)'}
    );

    // Foreign key constraints
    pgm.addConstraint('odoo_txn_orders', 'fk_odoo_txn_orders_txn_id', {
        foreignKeys: {
            columns: 'txn_id',
            references: 'charging_transactions(id)',
            onDelete: 'RESTRICT',
        },
    });

    pgm.addConstraint('odoo_order_invoice_link', 'fk_odoo_order_invoice_link_order_id', {
        foreignKeys: {
            columns: 'order_id',
            references: 'odoo_txn_orders(id)',
            onDelete: 'RESTRICT',
        },
    });

    pgm.addConstraint('odoo_order_invoice_link', 'fk_odoo_order_invoice_link_invoice_id', {
        foreignKeys: {
            columns: 'invoice_id',
            references: 'odoo_invoices(id)',
            onDelete: 'RESTRICT', // If we do CASCADE here there will be gaps
        },
    });

    // Ensure an order can only be linked to one invoice (but invoice can have multiple orders) many-to-one
    pgm.addConstraint('odoo_order_invoice_link', 'uq_odoo_order_invoice_link_order_id', {
        unique: ['order_id']
    });

    // Indexes for performance
    pgm.createIndex('odoo_txn_orders', 'txn_id', {name: 'idx_odoo_txn_orders_txn_id'});
    pgm.createIndex('odoo_invoices', 'odoo_invoice_id', {name: 'idx_odoo_invoices_odoo_invoice_id'});
    pgm.createIndex('odoo_order_invoice_link', 'order_id', {name: 'idx_odoo_order_invoice_link_order_id'});
    pgm.createIndex('odoo_order_invoice_link', 'invoice_id', {name: 'idx_odoo_order_invoice_link_invoice_id'});

    pgm.dropTable('bills', {ifExists: true, cascade: true});
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
    // The order is important here due to FK constraints
    pgm.dropTable('odoo_order_invoice_link', {ifExists: true, cascade: true});
    pgm.dropTable('odoo_invoices', {ifExists: true, cascade: true});
    pgm.dropTable('odoo_txn_orders', {ifExists: true, cascade: true});
};
