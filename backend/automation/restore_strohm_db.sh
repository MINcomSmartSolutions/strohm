#!/bin/bash

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

error() {
    echo -e "${RED}Error: $1${NC}" >&2
}

success() {
    echo -e "${GREEN}$1${NC}"
}

warning() {
    echo -e "${YELLOW}Warning: $1${NC}"
}

info() {
    echo -e "${BLUE}$1${NC}"
}

CONTAINER_NAME="db"
DB_NAME="strohm"
DB_USER="strohm_admin"
DB_PASSWORD=""
BACKUP_TAG="strohm_db_backup"
SNAPSHOT_ID=""
CLEAN_RESTORE=false
ENV=""

# Ensure restic is installed
if ! command -v restic &> /dev/null; then
    error "restic is not installed or not in PATH, please install it first at https://restic.readthedocs.io/en/v0.16.4/020_installation.html. Exiting..."
    exit 1
fi

if ! command -v docker &> /dev/null; then
    error "docker CLI not found. Please install Docker and ensure it's on PATH. Exiting..."
    exit 1
fi

# Check Docker daemon
if ! docker info &> /dev/null; then
    error "Cannot connect to Docker daemon. Ensure Docker is running and you have permission to access it. Exiting..."
    exit 1
fi

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -c|--container)
            CONTAINER_NAME="$2"
            shift 2
            ;;
        -u|--user)
            DB_USER="$2"
            shift 2
            ;;
        -d|--database)
            DB_NAME="$2"
            shift 2
            ;;
        -p|--password)
            DB_PASSWORD="$2"
            shift 2
            ;;
        -t|--tag)
            BACKUP_TAG="$2"
            shift 2
            ;;
        --clean)
            CLEAN_RESTORE=true
            shift 1
            ;;
        --environment)
            ENV="$2"
            shift 2
            ;;
        -s|--snapshot)
            SNAPSHOT_ID="$2"
            shift 2
            ;;
        *)
            error "Unknown option: $1"
            exit 1
            ;;
    esac
done


if [ -z "$ENV" ]; then
  echo "Please select the environment to restore from:"
  echo "1) Development"
  echo "2) Staging"
  echo "3) Production"

  read -r -p "Enter your choice (1-3): " choice

  case $choice in
      1)
          ENV="development"
          ;;
      2)
          ENV="staging"
          ;;
      3)
          ENV="production"
          ;;
      *)
          error "Invalid choice. Exiting..."
          exit 1
          ;;
  esac
fi
echo "Selected environment: $ENV"
RESTIC_REPOSITORY="/home/resticuser/backups-strohm/${ENV}/db"


# Ask user for restic repository password if not found in the environment
if [ -z "$RESTIC_PASSWORD" ]; then
  read -r -s -p "Enter restic repository password: " RESTIC_PASSWORD
  export RESTIC_PASSWORD
  echo
fi

# Check if container exists
if ! docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    error "Container '${CONTAINER_NAME}' does not exist"
    exit 1
fi

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    error "Container '${CONTAINER_NAME}' is not running"
    exit 1
fi

# Verify container is actually PostgreSQL
if ! docker exec "$CONTAINER_NAME" psql --version &> /dev/null; then
    error "Container '${CONTAINER_NAME}' does not appear to be a PostgreSQL container"
    exit 1
fi

# Check if restic repository exists
if ! restic -r "sftp:restic-backup-host:${RESTIC_REPOSITORY}" snapshots &> /dev/null; then
    error "Restic repository at '$RESTIC_REPOSITORY' not found or not initialized"
    exit 1
fi

info "Retrieving available backups..."
echo ""

# If no specific snapshot provided, let user choose
if [ -z "$SNAPSHOT_ID" ]; then
    echo "Available backups with tag '$BACKUP_TAG':"
    echo ""
    RESTIC_PASSWORD="${RESTIC_PASSWORD}" restic -r "sftp:restic-backup-host:${RESTIC_REPOSITORY}" snapshots --tag "$BACKUP_TAG"
    echo ""

    read -r -p "Enter snapshot ID to restore or 'latest' for the most recent: " SNAPSHOT_INPUT < /dev/tty
    if [[ "$SNAPSHOT_INPUT" == "latest" ]]; then
        SNAPSHOT_ID=latest
        info "Using latest snapshot"
    else
        SNAPSHOT_ID="$SNAPSHOT_INPUT"
        info "Using snapshot: $SNAPSHOT_ID"
    fi
fi

# Verify snapshot exists
if ! RESTIC_PASSWORD="${RESTIC_PASSWORD}" restic -r "sftp:restic-backup-host:${RESTIC_REPOSITORY}" ls $SNAPSHOT_ID  &> /dev/null; then
    error "Snapshot '$SNAPSHOT_ID' not found in repository"
    exit 1
fi

warning "==================================================================="
warning "WARNING: This will restore database '$DB_NAME'"
if [ "$CLEAN_RESTORE" = true ]; then
    warning "The database will be DROPPED and RECREATED before restore!"
fi
warning "==================================================================="
echo ""

read -r -p "Are you sure you want to continue? (y/n): " confirmation < /dev/tty

if [ "$confirmation" != "y" ]; then
    echo "Restore cancelled."
    exit 0
fi

success "Starting restore process..."
echo "Container: $CONTAINER_NAME"
echo "Database: $DB_NAME"
echo "User: $DB_USER"
echo "Repository: $RESTIC_REPOSITORY"
echo "Snapshot: $SNAPSHOT_ID"
echo "Clean restore: $CLEAN_RESTORE"
echo ""


# Drop and recreate database if clean restore requested
if [ "$CLEAN_RESTORE" = true ]; then
    warning "Dropping existing database '$DB_NAME'..."

    # Terminate existing connections
    docker exec -e PGPASSWORD="$DB_PASSWORD" "$CONTAINER_NAME" \
        psql -U "$DB_USER" -d postgres -c \
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" \
        &> /dev/null

    # Drop database
    if ! docker exec -e PGPASSWORD="$DB_PASSWORD" "$CONTAINER_NAME" \
        psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$DB_NAME\";" 2>&1; then
        error "Failed to drop database"
        exit 1
    fi

    # Create database
    info "Creating fresh database '$DB_NAME'..."
    if ! docker exec -e PGPASSWORD="$DB_PASSWORD" "$CONTAINER_NAME" \
        psql -U "$DB_USER" -d postgres -c "CREATE DATABASE \"$DB_NAME\";" 2>&1; then
        error "Failed to create database"
        exit 1
    fi

    success "Database recreated successfully"
fi

# Get the backup filename from the snapshot
info "Retrieving backup file information..."
BACKUP_FILE=$(RESTIC_PASSWORD="${RESTIC_PASSWORD}" restic -r "sftp:restic-backup-host:${RESTIC_REPOSITORY}" ls "$SNAPSHOT_ID" 2>/dev/null | grep "\.dump$" | head -1)

if [ -z "$BACKUP_FILE" ]; then
    error "Could not find backup file in snapshot"
    exit 1
fi

info "Found backup file: $BACKUP_FILE"


# Create temporary file for the dump
TEMP_DUMP="/tmp/strohm_restore_$$.dump"
trap 'rm -f "$TEMP_DUMP"' EXIT

# Restore database using temporary file approach
info "Downloading backup from restic repository..."
if ! RESTIC_PASSWORD="${RESTIC_PASSWORD}" restic -r "sftp:restic-backup-host:${RESTIC_REPOSITORY}" dump "$SNAPSHOT_ID" "$BACKUP_FILE" > "$TEMP_DUMP" 2>/dev/null; then
    error "Failed to download backup from restic"
    exit 1
fi

success "Backup downloaded successfully ($(du -h "$TEMP_DUMP" | cut -f1))"

# Copy dump file to container
info "Copying dump file to database container..."
if ! docker cp "$TEMP_DUMP" "$CONTAINER_NAME:/tmp/restore.dump"; then
    error "Failed to copy dump file to container"
    exit 1
fi

# Restore database from the dump file
info "Restoring database from backup file..."
if docker exec -e PGPASSWORD="$DB_PASSWORD" "$CONTAINER_NAME" \
    pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists -v /tmp/restore.dump 2>&1; then

    success "Database restore completed successfully"

    # Cleanup dump file from container
    docker exec "$CONTAINER_NAME" rm -f /tmp/restore.dump 2>/dev/null

    # Show database info
    echo ""
    info "Database information:"
    docker exec -e PGPASSWORD="$DB_PASSWORD" "$CONTAINER_NAME" \
        psql -U "$DB_USER" -d "$DB_NAME" -c \
        "SELECT schemaname, tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY schemaname, tablename LIMIT 10;"

    echo ""
    success "Restore completed successfully!"
    exit 0
else
    error "Database restore failed"
    # Cleanup dump file from container
    docker exec "$CONTAINER_NAME" rm -f /tmp/restore.dump 2>/dev/null
    exit 1
fi

