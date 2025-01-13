CREATE TABLE IF NOT EXISTS charging_events (
    id             serial,
    start_datetime timestamp NOT NULL,
    end_datetime   timestamp NOT NULL,
    energy_kwh     numeric   NOT NULL,
    created_at     timestamp DEFAULT CURRENT_TIMESTAMP,
    request_ref    integer   NOT NULL,
    price_total    double precision,
    PRIMARY KEY (id),
    FOREIGN KEY (request_ref) REFERENCES charging_requests ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_charging_events_request_ref ON charging_events (request_ref);

