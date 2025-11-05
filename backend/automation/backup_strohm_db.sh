#!/bin/bash

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

CONTAINER_NAME="db"
DB_NAME="strohm"
DB_USER="strohm_admin"
DB_PASSWORD=""
BACKUP_TAG="strohm_db_backup"
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
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
        -env|--environment)
            ENV="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            error "Unknown option: $1"
            usage
            ;;
    esac
done


# Prompt for environment if not provided via argument
if [ -z "$ENV" ]; then
    echo "Please select the environment you want backup to be saved:"
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
RESTIC_CONN_STRING="sftp:restic-backup-host:$RESTIC_REPOSITORY"

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
if ! restic -r "$RESTIC_CONN_STRING" snapshots &> /dev/null; then
    error "Restic repository at '$RESTIC_REPOSITORY' not found or not initialized"
    exit 1
fi

success "Starting backup process..."
echo "Container: $CONTAINER_NAME"
echo "Database: $DB_NAME"
echo "User: $DB_USER"
echo "Repository: $RESTIC_REPOSITORY"
echo "Tag: $BACKUP_TAG"
echo ""

# Perform backup
echo "Dumping database and streaming to restic..."
if docker exec -e PGPASSWORD="$DB_PASSWORD" "$CONTAINER_NAME" \
    pg_dump -U "$DB_USER" -Fc "$DB_NAME" 2>/dev/null | \
    RESTIC_PASSWORD="${RESTIC_PASSWORD}" restic -r "$RESTIC_CONN_STRING" backup --stdin \
    --stdin-filename "${DB_NAME}_$BACKUP_DATE.dump" \
    --tag "$BACKUP_TAG" 2>&1; then

    success "Database backup completed successfully"

    # Show recent snapshots
    echo ""
    echo "Recent backups:"
    RESTIC_PASSWORD="${RESTIC_PASSWORD}" restic -r "$RESTIC_CONN_STRING" snapshots --tag "$BACKUP_TAG" --latest 3

    exit 0
else
    error "Backup failed"
    exit 1
fi