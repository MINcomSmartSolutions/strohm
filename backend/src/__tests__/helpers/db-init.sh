#!/bin/bash
# Script to initialize the test database with the schema

# Start the test database container if it's not already running
echo "Starting test database container..."
docker run --rm --name db-test -e POSTGRES_USER=testuser -e POSTGRES_PASSWORD=testpassword -e POSTGRES_DB=testdb -p 5433:5432 -d postgres:16.6

# Wait for database to be ready
echo "Waiting for database to be ready..."
attempt=0
max_attempts=10
until PGPASSWORD=testpassword psql -h localhost -p 5433 -U testuser -d testdb -c "SELECT 1" > /dev/null 2>&1; do
  attempt=$((attempt+1))
  if [ $attempt -eq $max_attempts ]; then
    echo "Could not connect to database after $max_attempts attempts. Exiting."
    exit 1
  fi
  echo "Waiting for database to be ready... (attempt $attempt/$max_attempts)"
  sleep 2
done

echo "Database is ready."

# First, apply global objects (roles, etc.) from db-etc.sql
echo "Applying global database objects from db-etc.sql..."
PGPASSWORD=testpassword psql -h localhost -p 5433 -U testuser -d testdb -f ./database/db-etc.sql
if [ $? -ne 0 ]; then
  echo "Failed to apply global database objects. Exiting."
  exit 1
fi

echo "Global database objects applied successfully."

echo "Restoring database schema with psql..."
# Check if db-structure-strohm.sql exists
if [ ! -f ./database/db-structure-strohm.sql ]; then
  echo "Error: ./database/db-structure.sql not found."
  exit 1
fi

PGPASSWORD=testpassword psql -h localhost -p 5433 -U testuser -d testdb -f ./database/db-structure-strohm.sql
restore_status=$?

if [ $restore_status -ne 0 ]; then
  echo "Error: psql restore failed with status $restore_status"
fi
# Grant ownership of tables to strohm_admin
echo "Setting ownership of database objects to strohm_admin..."
PGPASSWORD=testpassword psql -h localhost -p 5433 -U testuser -d testdb -c "
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
