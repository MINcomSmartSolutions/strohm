CREATE TABLE IF NOT EXISTS access_logs (
    id               serial,
    user_ref         integer,
    ip               varchar(15),
    method           varchar(10)                         NOT NULL,
    path             varchar(255)                        NOT NULL,
    status_code      integer,
    returned_success boolean,
    response_time    integer,
    created_at       timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT access_logs_ref_fkey FOREIGN KEY (user_ref) REFERENCES users
);

