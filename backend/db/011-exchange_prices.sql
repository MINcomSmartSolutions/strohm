CREATE TABLE IF NOT EXISTS exchange_prices (
    id         integer   DEFAULT NEXTVAL('exchange_prices_exchange_id_seq'::regclass) NOT NULL,
    price      double precision                                                       NOT NULL,
    timestamp  timestamp                                                              NOT NULL,
    created_at timestamp DEFAULT NOW(),
    PRIMARY KEY (id)
);

