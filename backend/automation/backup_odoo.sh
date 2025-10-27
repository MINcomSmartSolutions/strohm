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

# Cleanup function
cleanup() {
    if [[ "$KEEP_TEMP" == false ]] && [[ -d "$BACKUP_DIR" ]]; then
        echo "Cleaning up temporary directory..."
        rm -rf "$BACKUP_DIR"
        success "Temporary directory removed"
    fi
}

# Set trap for cleanup on exit
trap cleanup EXIT


# Ensure restic is installed
if ! command -v restic &> /dev/null; then
    echo "restic could not be found, please install it first at https://restic.readthedocs.io/en/v0.16.4/020_installation.html. Exiting..."
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

PG_CONTAINER="strohm_db"
ODOO_CONTAINER="strohm_odoo"
DB_NAME="odoo"
DB_USER="postgres"

TEMP_DIR="/tmp/odoo-backup"
# Create timestamped backup directory
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${TEMP_DIR}/${DB_NAME}_${BACKUP_DATE}"

readonly BACKUP_DIR=/tmp/backup_odoo
mkdir -p "$BACKUP_DIR"


FILESTORE_PATH="/var/lib/odoo/filestore"
FULL_FILESTORE_PATH="${FILESTORE_PATH}/${DB_NAME}"
FILESTORE_TAR="${BACKUP_DIR}/filestore.tar.gz"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -c|--pg-container) PG_CONTAINER="$2"; shift 2 ;;
        -o|--odoo-container) ODOO_CONTAINER="$2"; shift 2 ;;
        -u|--user) DB_USER="$2"; shift 2 ;;
        -d|--database) DB_NAME="$2"; shift 2 ;;
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

success "Backing up Odoo database and filestore..."
echo "Please select the environment:"
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
        echo "Invalid choice. Exiting..."
        exit 1
        ;;
esac
echo "Selected environment: $ENV"

# Ask user for restic repository password if not found in the environment
if [ -z "$RESTIC_PASSWORD" ]; then
  read -r -s -p "Enter restic repository password: " RESTIC_PASSWORD
  export RESTIC_PASSWORD
  echo
fi

RESTIC_REPOSITORY="/home/resticuser/backups-strohm/$ENV/odoo"
RESTIC_CONN_STRING="sftp:restic-backup-host:$RESTIC_REPOSITORY"

success "Starting Odoo backup..."
echo "PostgreSQL Container: $PG_CONTAINER"
echo "Odoo Container: $ODOO_CONTAINER"
echo "Database: $DB_NAME"
echo "Backup Directory: $BACKUP_DIR"
echo ""


# Create temporary backup directory
if ! mkdir -p "$BACKUP_DIR"; then
    error "Failed to create temporary directory: $BACKUP_DIR"
    exit 1
fi
success "Created temporary backup directory"


#check if restic remote is set
if ! restic -r "$RESTIC_CONN_STRING" snapshots;
then
  error "Restic remote connection could not be established. Exiting..."
  error "Are you sure the restic remote is set up correctly, host is reachable?"
  exit 1
fi


# 1. Backup database to file
echo ""
echo "Backing up database to file..."
DB_DUMP_FILE="${BACKUP_DIR}/${DB_NAME}.dump"

if docker exec -e PGPASSWORD="$DB_PASSWORD" "$PG_CONTAINER" \
    pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "$DB_DUMP_FILE" 2>/dev/null; then

    DB_SIZE=$(du -h "$DB_DUMP_FILE" | cut -f1)
    success "Database backup completed ($DB_SIZE)"
else
    error "Database backup failed"
    exit 1
fi

# 2. Backup filestore to tar
echo ""
echo "Backing up filestore..."


if docker exec "$ODOO_CONTAINER" test -d "$FULL_FILESTORE_PATH" 2>/dev/null; then
    if docker exec "$ODOO_CONTAINER" \
        tar -czf - -C "$FILESTORE_PATH" "$DB_NAME" > "$FILESTORE_TAR" 2>/dev/null; then

        FS_SIZE=$(du -h "$FILESTORE_TAR" | cut -f1)
        success "Filestore backup completed ($FS_SIZE)"
    else
        error "Filestore backup failed"
        exit 1
    fi
else
    warning "Filestore directory not found at $FULL_FILESTORE_PATH, skipping"
fi

# 3. Create metadata file
echo ""
echo "Creating backup metadata..."
METADATA_FILE="${BACKUP_DIR}/backup_info.txt"

cat > "$METADATA_FILE" << EOF
Odoo Backup Metadata
====================
Backup Date: $(date '+%Y-%m-%d %H:%M:%S %Z')
Database Name: $DB_NAME
PostgreSQL Container: $PG_CONTAINER
pg_dump Version: $(docker exec "$PG_CONTAINER" pg_dump --version 2>/dev/null || echo "Unknown")
Odoo Container: $ODOO_CONTAINER
Database User: $DB_USER
Odoo Version: $(docker exec "$ODOO_CONTAINER" odoo --version 2>/dev/null || echo "Unknown")

Files in this backup:
- ${DB_NAME}.dump: PostgreSQL database dump (custom format)
- filestore.tar.gz: Odoo filestore archive
- backup_info.txt: This metadata file
EOF

success "Metadata file created"

# 4. Backup entire directory to restic
echo ""
echo "Backing up directory to restic repository..."

if restic -r "$RESTIC_CONN_STRING" backup "$BACKUP_DIR" \
    --tag odoo-backup \
    --tag "db:${DB_NAME}" \
    --tag "date:${BACKUP_DATE}" 2>&1; then

    success "Restic backup completed successfully"
else
    error "Restic backup failed"
    exit 1
fi

success "Backup completed successfully!"
exit 0