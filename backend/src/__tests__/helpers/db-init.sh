#!/bin/bash
# Script to initialize the test database with the schema

# Clean up any existing container
echo "Cleaning up any existing test database container..."
docker stop db-test >/dev/null 2>&1 || true
docker rm -f db-test >/dev/null 2>&1 || true
sleep 1

# Start the test database container with strohm database
echo "Starting test database container..."
docker run --rm --name db-test \
  -e POSTGRES_USER=testuser \
  -e POSTGRES_PASSWORD=testpassword \
  -e POSTGRES_DB=strohm \
  -p 5433:5432 \
  -d postgres:16.6

if [ $? -ne 0 ]; then
  echo "Failed to start database container. Exiting."
  exit 1
fi

# Wait for database to be ready
echo "Waiting for database to be ready..."
attempt=0
max_attempts=30
until PGPASSWORD=testpassword psql -h localhost -p 5433 -U testuser -d strohm -c "SELECT 1" > /dev/null 2>&1; do
  attempt=$((attempt+1))
  if [ $attempt -eq $max_attempts ]; then
    echo "Could not connect to database after $max_attempts attempts. Exiting."
    docker logs db-test
    exit 1
  fi
  echo "Waiting for database to be ready... (attempt $attempt/$max_attempts)"
  sleep 1
done

echo "Database is ready."

# Create roles first
echo "Creating database roles..."
PGPASSWORD=testpassword psql -h localhost -p 5433 -U testuser -d strohm <<EOF
-- Create roles if they don't exist
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'strohm_admin') THEN
    CREATE ROLE strohm_admin WITH LOGIN PASSWORD 'admin_password';
  END IF;

  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'strohm_app') THEN
    CREATE ROLE strohm_app WITH LOGIN PASSWORD 'app_password';
  END IF;
END
\$\$;

-- Grant necessary permissions
GRANT ALL PRIVILEGES ON DATABASE strohm TO strohm_admin;
GRANT CONNECT ON DATABASE strohm TO strohm_app;
EOF

if [ $? -ne 0 ]; then
  echo "Warning: Some database roles may not have been created"
fi

echo "Database roles created successfully."

# Restore schema
echo "Restoring database schema..."
if [ ! -f ./database/db-structure-strohm.sql ]; then
  echo "Error: ./database/db-structure-strohm.sql not found."
  exit 1
fi

# Filter out DROP DATABASE, CREATE DATABASE, and \connect commands
# since we're already connected to the strohm database
echo "Filtering SQL script for test environment..."
grep -v "^DROP DATABASE strohm" ./database/db-structure-strohm.sql | \
  grep -v "^CREATE DATABASE strohm" | \
  grep -v "^\\\\connect strohm" | \
  grep -v "^COMMENT ON DATABASE strohm" > /tmp/db-structure-filtered.sql

PGPASSWORD=testpassword psql -h localhost -p 5433 -U testuser -d strohm -f /tmp/db-structure-filtered.sql
restore_status=$?

# Clean up temporary file
rm -f /tmp/db-structure-filtered.sql

if [ $restore_status -ne 0 ]; then
  echo "Error: psql restore failed with status $restore_status"
  exit 1
fi

# Grant permissions on all objects
echo "Setting permissions on database objects..."
PGPASSWORD=testpassword psql -h localhost -p 5433 -U testuser -d strohm <<EOF
-- Grant all permissions to testuser
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO testuser;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO testuser;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO testuser;

-- Also grant to strohm_admin and strohm_app
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO strohm_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO strohm_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO strohm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO strohm_app;

-- Set default privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO testuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO testuser;
EOF

echo "Database setup completed successfully!"
