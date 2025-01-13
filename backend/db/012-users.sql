CREATE TABLE IF NOT EXISTS users (
    user_id       serial,
    first_name    varchar(255)                        NOT NULL,
    email         varchar(255)                        NOT NULL,
    rfid          varchar(255)                        NOT NULL,
    password_hash varchar(255)                        NOT NULL,
    active        boolean   DEFAULT TRUE,
    created_at    timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at    timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at    timestamp,
    odoo_id       integer,
    last_name     varchar,
    PRIMARY KEY (user_id),
    UNIQUE (rfid)
);

CREATE UNIQUE INDEX IF NOT EXISTS users_odoo_id_uindex ON users (odoo_id);

