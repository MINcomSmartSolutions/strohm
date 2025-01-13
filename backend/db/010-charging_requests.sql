CREATE TABLE IF NOT EXISTS charging_requests (
    id                serial,
    start_datetime    timestamp NOT NULL,
    end_datetime      timestamp,
    station_id        integer   NOT NULL,
    created_at        timestamp DEFAULT CURRENT_TIMESTAMP,
    updated_at        timestamp DEFAULT CURRENT_TIMESTAMP,
    user_ref          integer   NOT NULL,
    success           boolean   DEFAULT FALSE,
    price_offered_ref integer,
    PRIMARY KEY (id),
    FOREIGN KEY (user_ref) REFERENCES users,
    CONSTRAINT charging_requests_exchange_prices_id_fk FOREIGN KEY (price_offered_ref) REFERENCES exchange_prices
);

COMMENT ON COLUMN charging_requests.price_offered_ref IS 'Initially offered price from exchange_prices table';

CREATE INDEX IF NOT EXISTS idx_charging_requests_station_id ON charging_requests (station_id);

CREATE TRIGGER update_charging_requests_timestamp
    BEFORE UPDATE
    ON charging_requests
    FOR EACH ROW
EXECUTE PROCEDURE update_timestamp();

