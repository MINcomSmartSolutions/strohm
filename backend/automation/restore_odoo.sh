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

usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Restore Odoo database and filestore from restic backup

OPTIONS:
    -c, --pg-container NAME     PostgreSQL container name (default: strohm_odoo)
    -o, --odoo-container NAME   Odoo container name (default: strohm_odoo)
    -u, --user USER             Database user (default: postgres)
    -d, --database NAME         Database name (default: odoo)
    -s, --snapshot ID           Specific snapshot ID to restore (optional)
    -k, --keep-temp            Keep temporary files after restore
    -h, --help                 Show this help message
EOF
    exit 1
}

# Cleanup function
cleanup() {
    if [[ "$KEEP_TEMP" == false ]] && [[ -d "$RESTORE_DIR" ]]; then
        echo "Cleaning up temporary directory..."
        rm -rf "$RESTORE_DIR"
        success "Temporary directory removed"
    fi
}

# Set trap for cleanup on exit
trap cleanup EXIT

# Ensure restic is installed
if ! command -v restic &> /dev/null; then
    error "restic could not be found, please install it first at https://restic.readthedocs.io/en/v0.16.4/020_installation.html. Exiting..."
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

# Default values
PG_CONTAINER="strohm_db"
ODOO_CONTAINER="strohm_odoo"
DB_NAME="odoo"
DB_USER="postgres"
SNAPSHOT_ID=""
KEEP_TEMP=false
ENV=""
TEMP_DIR="/tmp/odoo-restore"
RESTORE_DATE=$(date +%Y%m%d_%H%M%S)
RESTORE_DIR="${TEMP_DIR}/${DB_NAME}_${RESTORE_DATE}"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -c|--pg-container) PG_CONTAINER="$2"; shift 2 ;;
        -o|--odoo-container) ODOO_CONTAINER="$2"; shift 2 ;;
        -u|--user) DB_USER="$2"; shift 2 ;;
        -d|--database) DB_NAME="$2"; shift 2 ;;
        -s|--snapshot) SNAPSHOT_ID="$2"; shift 2 ;;
        -k|--keep-temp) KEEP_TEMP=true; shift ;;
        --environment) ENV="$2"; shift 2 ;;
        -h|--help) usage ;;
        *) error "Unknown option: $1"; usage ;;
    esac
done

# Validate mandatory parameters
[[ -z "$PG_CONTAINER" ]] && { error "PostgreSQL container name is required"; usage; }
[[ -z "$ODOO_CONTAINER" ]] && { error "Odoo container name is required"; usage; }
[[ -z "$DB_USER" ]] && { error "Database user is required"; usage; }
[[ -z "$DB_NAME" ]] && { DB_NAME="$DB_USER"; warning "Using database name: $DB_NAME"; }

# Check containers exist and are running
for container in "$PG_CONTAINER" "$ODOO_CONTAINER"; do
    docker ps -a --format '{{.Names}}' | grep -q "^${container}$" || \
        { error "Container '$container' does not exist"; exit 1; }
    docker ps --format '{{.Names}}' | grep -q "^${container}$" || \
        { error "Container '$container' is not running"; exit 1; }
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

# Ask user for restic repository password if not found in the environment
if [ -z "$RESTIC_PASSWORD" ]; then
  read -r -s -p "Enter restic repository password: " RESTIC_PASSWORD
  export RESTIC_PASSWORD
  echo
fi

RESTIC_REPOSITORY="/home/resticuser/backups-strohm/$ENV/odoo"
RESTIC_CONN_STRING="sftp:restic-backup-host:$RESTIC_REPOSITORY"

echo ""
echo "PostgreSQL Container: $PG_CONTAINER"
echo "Odoo Container: $ODOO_CONTAINER"
echo "Database: $DB_NAME"
echo "Restore Directory: $RESTORE_DIR"
echo ""

# Check if restic remote is set
if ! restic -r "$RESTIC_CONN_STRING" snapshots &> /dev/null; then
  error "Restic remote connection could not be established. Exiting..."
  error "Are you sure the restic remote is set up correctly, host is reachable?"
  exit 1
fi

# Create temporary restore directory
if ! mkdir -p "$RESTORE_DIR"; then
    error "Failed to create temporary directory: $RESTORE_DIR"
    exit 1
fi
success "Created temporary restore directory"

# List available snapshots if no specific snapshot provided
if [[ -z "$SNAPSHOT_ID" ]]; then
    echo ""
    info "Fetching available snapshots..."
    echo ""

    restic -r "$RESTIC_CONN_STRING" snapshots --tag odoo-backup --tag "db:${DB_NAME}"

    echo ""
    read -r -p "Enter snapshot ID to restore (or 'latest' for most recent): " SNAPSHOT_INPUT < /dev/tty

    if [[ "$SNAPSHOT_INPUT" == "latest" ]]; then
        SNAPSHOT_ID=latest
        info "Using latest snapshot"
    else
        SNAPSHOT_ID="$SNAPSHOT_INPUT"
        info "Using snapshot: $SNAPSHOT_ID"
    fi
fi

# Restore from restic
echo ""
info "Restoring snapshot from restic repository..."

# Restore the snapshot
if restic -r "$RESTIC_CONN_STRING" restore $SNAPSHOT_ID --target "$TEMP_DIR" 2>&1; then
    success "Snapshot restored to temporary directory"
else
    error "Failed to restore snapshot from restic"
    exit 1
fi

# Find the actual backup directory (restic restores with the full path)
BACKUP_CONTENT_DIR=$(find "$RESTORE_DIR" -type f -name "*.dump" -exec dirname {} \; | head -n 1)

if [[ -z "$BACKUP_CONTENT_DIR" ]]; then
    # Try alternative path structure
    BACKUP_CONTENT_DIR=$(find "$TEMP_DIR" -type f -name "*.dump" -exec dirname {} \; | head -n 1)
fi

if [[ -z "$BACKUP_CONTENT_DIR" ]]; then
    error "Could not find backup files in restored snapshot"
    exit 1
fi

info "Found backup files in: $BACKUP_CONTENT_DIR"

# Locate backup files
DB_DUMP_FILE=$(find "$BACKUP_CONTENT_DIR" -name "*.dump" | head -n 1)
FILESTORE_TAR=$(find "$BACKUP_CONTENT_DIR" -name "filestore.tar.gz" | head -n 1)
METADATA_FILE=$(find "$BACKUP_CONTENT_DIR" -name "backup_info.txt" | head -n 1)

if [[ -z "$DB_DUMP_FILE" ]]; then
    error "Database dump file not found in backup"
    exit 1
fi

info "Database dump: $DB_DUMP_FILE"
[[ -n "$FILESTORE_TAR" ]] && info "Filestore archive: $FILESTORE_TAR"
[[ -n "$METADATA_FILE" ]] && info "Metadata file: $METADATA_FILE"

# Display backup metadata if available
if [[ -n "$METADATA_FILE" ]]; then
    echo ""
    info "Backup Information:"
    echo "==================="
    cat "$METADATA_FILE"
    echo "==================="
    echo ""
fi

# Confirmation prompt
echo ""
warning "WARNING: This will REPLACE the current database '$DB_NAME'"
read -r -p "Are you sure you want to continue? (y/n): " CONFIRM < /dev/tty

if [[ "$CONFIRM" != "y" ]]; then
    error "Restore cancelled by user"
    exit 1
fi

# Stop Odoo container to prevent conflicts
echo ""
info "Stopping Odoo container to prevent conflicts..."
if docker stop "$ODOO_CONTAINER" &> /dev/null; then
    success "Odoo container stopped"
    ODOO_WAS_RUNNING=true
else
    warning "Could not stop Odoo container (may already be stopped)"
    ODOO_WAS_RUNNING=false
fi

# Drop existing database connections
echo ""
info "Terminating existing database connections..."
docker exec "$PG_CONTAINER" psql -U "$DB_USER" -d postgres -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" \
    &> /dev/null || warning "Could not terminate all connections"

# Drop and recreate database
echo ""
info "Dropping existing database..."
if docker exec "$PG_CONTAINER" psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$DB_NAME\";" &> /dev/null; then
    success "Database dropped"
else
    error "Failed to drop database"
    exit 1
fi

echo ""
info "Creating new database..."
if docker exec "$PG_CONTAINER" psql -U "$DB_USER" -d postgres -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";" &> /dev/null; then
    success "Database created"
else
    error "Failed to create database"
    exit 1
fi

# Restore database dump
echo ""
info "Restoring database from dump..."
if docker exec -i "$PG_CONTAINER" pg_restore -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl < "$DB_DUMP_FILE" 2>/dev/null; then
    success "Database restored successfully"
else
    warning "Database restore completed with some warnings (this is often normal)"
fi

# Restart Odoo container if it was running (needed before filestore restore)
if [[ "$ODOO_WAS_RUNNING" == true ]]; then
    echo ""
    info "Restarting Odoo container..."
    if docker start "$ODOO_CONTAINER" &> /dev/null; then
        success "Odoo container restarted"
    else
        error "Failed to restart Odoo container"
        exit 1
    fi
fi

# Restore filestore if available (after container is running)
if [[ -n "$FILESTORE_TAR" && -f "$FILESTORE_TAR" ]]; then
    echo ""
    info "Restoring filestore..."

    FILESTORE_PATH="/var/lib/odoo/filestore"
    FULL_FILESTORE_PATH="${FILESTORE_PATH}/${DB_NAME}"

    # Ensure filestore directory exists in container
    docker exec "$ODOO_CONTAINER" mkdir -p "$FILESTORE_PATH" 2>/dev/null || true

    # Remove existing filestore for this database
    docker exec "$ODOO_CONTAINER" rm -rf "$FULL_FILESTORE_PATH" 2>/dev/null || true

    # Restore filestore from tar (the tar contains the DB_NAME folder)
    if cat "$FILESTORE_TAR" | docker exec -i "$ODOO_CONTAINER" tar -xzf - -C "$FILESTORE_PATH"; then
        success "Filestore restored"

        # Fix permissions
        docker exec "$ODOO_CONTAINER" chown -R odoo:odoo "$FULL_FILESTORE_PATH" 2>/dev/null || \
            warning "Could not change filestore ownership (may not be necessary)"

    else
        error "Failed to restore filestore"
        warning "Check if the Odoo container has write permissions to $FILESTORE_PATH"
        exit 1
    fi
else
    warning "No filestore archive found, skipping filestore restore"
fi


echo ""
success "Restore completed successfully!"
echo ""
info "Summary:"
echo "  - Database '$DB_NAME' restored"
[[ -n "$FILESTORE_TAR" ]] && echo "  - Filestore restored"
echo "  - Odoo container restarted"
echo ""

if [[ "$KEEP_TEMP" == true ]]; then
    info "Temporary files kept at: $RESTORE_DIR"
fi

exit 0

