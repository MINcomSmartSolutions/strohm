#!/bin/bash
# Script to initialize the test database with the schema
# For local development - starts Docker container and runs migrations
# In CI, the database service is already running

# Check if we need to start Docker container (local dev only)
if ! pg_isready -h "${STROHM_DB_HOST:-localhost}" -p "${STROHM_DB_PORT:-5433}" -U "${STROHM_DB_USER:-testuser}" > /dev/null 2>&1; then
    echo "Starting test database container..."
    docker run --rm --name db-test \
        -e POSTGRES_USER="${STROHM_DB_USER:-testuser}" \
        -e POSTGRES_PASSWORD="${STROHM_DB_PASSWORD:-testpassword}" \
        -e POSTGRES_DB="${STROHM_DB_NAME:-testdb}" \
        -p "${STROHM_DB_PORT:-5433}":5432 \
        -d postgres:16.6

    # Wait for database to be ready
    echo "Waiting for database to be ready..."
    attempt=0
    max_attempts=10
    until pg_isready -h "${STROHM_DB_HOST:-localhost}" -p "${STROHM_DB_PORT:-5433}" -U "${STROHM_DB_USER:-testuser}" > /dev/null 2>&1; do
      attempt=$((attempt+1))
      if [ $attempt -eq $max_attempts ]; then
        echo "Could not connect to database after $max_attempts attempts. Exiting."
        exit 1
      fi
      echo "Waiting for database to be ready... (attempt $attempt/$max_attempts)"
      sleep 2
    done
else
    echo "Database is already running."
fi

echo "Database is ready."

# Apply global database objects (roles, etc.)
echo "Applying global database objects from db-etc.sql..."
PGPASSWORD=${STROHM_DB_PASSWORD:-testpassword} psql -h "${STROHM_DB_HOST:-localhost}" -p "${STROHM_DB_PORT:-5433}" -U "${STROHM_DB_USER:-testuser}" -d "${STROHM_DB_NAME:-testdb}" -f ./database/db-etc.sql
if [ $? -ne 0 ]; then
  echo "Failed to create database roles. Exiting."
  exit 1
fi

echo "Database roles created successfully."

# Run migrations
echo "Running database migrations..."
export STROHM_DB_USER=${STROHM_DB_USER:-testuser}
export STROHM_DB_PASSWORD=${STROHM_DB_PASSWORD:-testpassword}
export STROHM_DB_HOST=${STROHM_DB_HOST:-localhost}
export STROHM_DB_PORT=${STROHM_DB_PORT:-5433}
export STROHM_DB_NAME=${STROHM_DB_NAME:-testdb}

node ./src/__tests__/helpers/migrate-test-db.js
migrate_status=$?

if [ $migrate_status -ne 0 ]; then
  echo "Error: database migrations failed with status $migrate_status"
  exit 1
fi

# Grant ownership of tables to strohm_admin
echo "Setting ownership of database objects to strohm_admin..."
PGPASSWORD=${STROHM_DB_PASSWORD:-testpassword} psql -h "${STROHM_DB_HOST:-localhost}" -p "${STROHM_DB_PORT:-5433}" -U "${STROHM_DB_USER:-testuser}" -d "${STROHM_DB_NAME:-testdb}" -c "
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
