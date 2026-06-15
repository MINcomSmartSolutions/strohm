#!/bin/bash
# Script to initialize the test database with the schema
# For local development - starts Docker container and runs migrations
# In CI, the database service is already running

CONTAINER_NAME="db-test"
DB_HOST="${STROHM_DB_HOST:-localhost}"
DB_PORT="5433"
DB_USER="${STROHM_DB_USER:-testuser}"
DB_PASSWORD="${STROHM_DB_PASSWORD:-testpassword}"
DB_NAME="${STROHM_DB_NAME:-testdb}"
CONTAINER_STARTED=false

# Check if the database port is already accepting connections (CI service container,
# or a locally running instance). Uses only bash built-ins — no psql/pg_isready needed.
db_port_open() {
  (echo > /dev/tcp/${DB_HOST}/${DB_PORT}) 2>/dev/null
}

# Run a psql command either inside our Docker container (local dev)
# or via the host psql binary (CI, where it is pre-installed on ubuntu-latest).
# Usage: run_psql [extra psql args...]
run_psql() {
  if [ "${CONTAINER_STARTED}" = "true" ]; then
    docker exec -i ${CONTAINER_NAME} \
      env PGPASSWORD="${DB_PASSWORD}" \
      psql -U "${DB_USER}" -d "${DB_NAME}" "$@"
  else
    PGPASSWORD="${DB_PASSWORD}" psql \
      -h "${DB_HOST}" -p "${DB_PORT}" \
      -U "${DB_USER}" -d "${DB_NAME}" "$@"
  fi
}

if db_port_open; then
    echo "Database is already available on ${DB_HOST}:${DB_PORT} — skipping container start."
else
    echo "Starting test database container..."
    docker run --rm --name ${CONTAINER_NAME} \
        -e POSTGRES_USER="${DB_USER}" \
        -e POSTGRES_PASSWORD="${DB_PASSWORD}" \
        -e POSTGRES_DB="${DB_NAME}" \
        -p ${DB_PORT}:5432 \
        -d postgres:16.6

    CONTAINER_STARTED=true

    # Wait for the DB inside the container to be ready.
    # Uses docker exec so no local PostgreSQL client tools are required.
    echo "Waiting for database to be ready..."
    attempt=0
    max_attempts=30
    until docker exec ${CONTAINER_NAME} pg_isready -U "${DB_USER}" > /dev/null 2>&1; do
      attempt=$((attempt+1))
      if [ $attempt -eq $max_attempts ]; then
        echo "Could not connect to database after $max_attempts attempts. Exiting."
        exit 1
      fi
      echo "Waiting for database to be ready... (attempt $attempt/$max_attempts)"
      sleep 2
    done
fi

echo "Database is ready."

# Apply global database objects (roles, etc.)
echo "Applying global database objects from db-etc.sql..."
run_psql < ./database/db-etc.sql
if [ $? -ne 0 ]; then
  echo "Failed to create database roles. Exiting."
  exit 1
fi

echo "Database roles created successfully."

# Run migrations
echo "Running database migrations..."
export STROHM_DB_USER=${DB_USER}
export STROHM_DB_PASSWORD=${DB_PASSWORD}
export STROHM_DB_HOST=${DB_HOST}
export STROHM_DB_PORT=${DB_PORT}
export STROHM_DB_NAME=${DB_NAME}

node ./src/__tests__/helpers/migrate-test-db.js
migrate_status=$?

if [ $migrate_status -ne 0 ]; then
  echo "Error: database migrations failed with status $migrate_status"
  exit 1
fi

# Grant ownership of tables to strohm_admin
echo "Setting ownership of database objects to strohm_admin..."
run_psql -c "
  DO
  \$\$
  DECLARE
    tbl text;
    seq text;
  BEGIN
    -- Set ownership of tables
    FOR tbl IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
      EXECUTE format('ALTER TABLE %I OWNER TO strohm_admin', tbl);
    END LOOP;

    -- Set ownership of sequences
    FOR seq IN (SELECT sequencename FROM pg_sequences WHERE schemaname = 'public') LOOP
      EXECUTE format('ALTER SEQUENCE %I OWNER TO strohm_admin', seq);
    END LOOP;
  END
  \$\$;
"

echo "Database setup completed successfully!"
