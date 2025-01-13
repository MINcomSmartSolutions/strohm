CREATE TABLE IF NOT EXISTS blacklisted_tokens (
    token      varchar(255)                        NOT NULL,
    created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
    id         serial,
    PRIMARY KEY (id)
);

