#!/bin/bash

# Ensure restic is installed
if ! command -v restic &> /dev/null; then
    echo "restic could not be found, please install it first at https://restic.readthedocs.io/en/v0.16.4/020_installation.html. Exiting..."
    exit 1
fi

# Parse command line arguments
ODOO_DB=""
ODOO_DB_USER=""
DB_HOST="localhost"
DB_PORT="5432"
DOCKER_NAME="strohm_odoo"
DOCKER_NAME_DB="strohm_db"

while [[ $# -gt 0 ]]; do
    case $1 in
        --db)
            ODOO_DB="$2"
            shift 2
            ;;
        --db-user)
            ODOO_DB_USER="$2"
            shift 2
            ;;
        --host)
            DB_HOST="$2"
            shift 2
            ;;
        --port)
            DB_PORT="$2"
            shift 2
            ;;
        --db-container-name)
            DOCKER_NAME_DB="$2"
            shift 2
            ;;
        --odoo-container-name)
            DOCKER_NAME="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 --db DATABASE_NAME --db-user DATABASE_USER [--host HOST] [--port PORT]"
            echo "  --db          Database name (required)"
            echo "  --db-user     Database user (required)"
            echo "  --host        Database host (default: localhost)"
            echo "  --port        Database port (default: 5432)"
            echo "  --db-container-name  Name of the database container (default: strohm_db)"
            echo "  --odoo-container-name Name of the Odoo container (default: strohm_odoo)"
            echo "  -h, --help    Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Check required parameters
if [ -z "${ODOO_DB}" ] || [ -z "${ODOO_DB_USER}" ]; then
    echo "Error: --db and --db-user parameters are required."
    echo "Usage: $0 --db DATABASE_NAME --db-user DATABASE_USER [--host HOST] [--port PORT]"
    echo "Use --help for more information"
    exit 1
fi

echo "Using database: ${ODOO_DB} with user: ${ODOO_DB_USER} on ${DB_HOST}:${DB_PORT}"



echo "Please select the environment:"
echo "1) Development"
echo "2) Production"
echo "3) Staging"

read -r -p "Enter your choice (1-3): " choice

case $choice in
    1)
        ENV="development"
        ;;
    2)
        ENV="production"
        ;;
    3)
        ENV="staging"
        ;;
    *)
        echo "Invalid choice. Exiting..."
        exit 1
        ;;
esac

echo "Selected environment: $ENV"

CURRENT_DIR=$(pwd)


# This is the directory where the backup will be restored
readonly BACKUP_DIR="/tmp/backup_odoo"

# Make sure RESTORE_DIR is an absolute path
RESTORE_DIR="${BACKUP_DIR}"
RESTIC_REPOSITORY="/home/resticuser/backups-strohm/${ENV}/odoo"

# The actual backup file might be in a nested directory structure
BACKUP_FILE="${RESTORE_DIR}/odoo_db.sql"
NESTED_BACKUP_FILE="${RESTORE_DIR}/tmp/backup_odoo/odoo_db.sql"

# Check if restic remote is accessible
# Show available snapshots
echo "Available snapshots:"
if ! restic -r "sftp:restic-backup-host:${RESTIC_REPOSITORY}" snapshots; then
    echo "Restic remote connection could not be established. Exiting..."
    exit 1
fi

read -r -p "Enter snapshot ID to restore: " SNAPSHOT_ID


# Restore from selected snapshot
mkdir -p "${RESTORE_DIR}"
if ! restic -r "sftp:restic-backup-host:${RESTIC_REPOSITORY}" restore "${SNAPSHOT_ID}" --target "${RESTORE_DIR}"; then
    echo "Restore failed. Exiting..."
    exit 1
fi


# Check if backup file exists
if [ ! -f "${BACKUP_FILE}" ] && [ ! -f "${NESTED_BACKUP_FILE}" ]; then
    echo "Backup file not found at ${BACKUP_FILE} or ${NESTED_BACKUP_FILE}. Exiting..."
    exit 1
fi

# Stop Odoo container
echo "Stopping Odoo container..."
if ! docker stop "${DOCKER_NAME}"; then
    echo "Failed to stop Odoo container. Exiting..."
    exit 1
fi

# Restore database
echo "Restoring database from file ${BACKUP_FILE}..."
if ! docker exec -i "${DOCKER_NAME_DB}" psql -U "${ODOO_DB_USER}" -d "${ODOO_DB}" < "${BACKUP_FILE}" && ! docker exec -i "${DOCKER_NAME_DB}" psql -U "${ODOO_DB_USER}" -d "${ODOO_DB}" < "${NESTED_BACKUP_FILE}"; then
    echo "Database restore failed. Starting Odoo container and exiting..."
    docker start "${DOCKER_NAME}" || echo "Failed to start Odoo container"
    exit 1
fi

# Restore filestore
echo "Restoring filestore..."
# Check for filestore in both regular and nested location
if [ -d "${RESTORE_DIR}/filestore" ] || [ -d "${RESTORE_DIR}/tmp/backup_odoo/filestore" ]; then
    FILESTORE_PATH="${RESTORE_DIR}/filestore"

    # If not in the expected location, use the nested path
    if [ ! -d "${FILESTORE_PATH}" ] || [ -z "$(ls -A "${FILESTORE_PATH}")" ]; then
        FILESTORE_PATH="${RESTORE_DIR}/tmp/backup_odoo/filestore"
    fi

    if [ -d "${FILESTORE_PATH}" ] && [ ! -z "$(ls -A "${FILESTORE_PATH}")" ]; then
        echo "Found filestore at ${FILESTORE_PATH}"

        # Start the container first before attempting to interact with it
        echo "Starting Odoo container for filestore operations..."
        if ! docker start "${DOCKER_NAME}"; then
            echo "Failed to start Odoo container. Cannot restore filestore. Exiting..."
            exit 1
        fi

        # Give the container a moment to fully start
        sleep 3

        if ! docker exec -u root -i "${DOCKER_NAME}" rm -rf /var/lib/odoo/filestore; then
            echo "Failed to remove existing filestore. The operation will continue but there might be issues."
        fi

        if ! docker cp "${FILESTORE_PATH}" "${DOCKER_NAME}:/var/lib/odoo/"; then
            echo "Filestore restore failed. Exiting..."
            exit 1
        fi

        # Set filestore permissions
        echo "Setting filestore permissions..."
        if ! docker exec -u root -i "${DOCKER_NAME}" chown -R odoo:odoo /var/lib/odoo/filestore; then
            echo "Failed to set filestore permissions. This may cause issues."
        fi

        # Stop the container to restart it cleanly later
        echo "Stopping container for clean restart..."
        docker stop "${DOCKER_NAME}"
    else
        echo "Filestore directory exists but is empty, skipping..."
    fi
else
    echo "No filestore found in backup, skipping..."
fi

# Start Odoo container
echo "Starting Odoo container..."
if ! docker start "${DOCKER_NAME}"; then
    echo "Failed to start Odoo container. Please check the container status manually."
    exit 1
fi

# Cleanup
echo "Cleaning up temporary files..."
if [ -d "${RESTORE_DIR}" ]; then
    rm -rf "${RESTORE_DIR}"
fi

echo -e "\033[32mSuccessfully restored Odoo database and filestore from snapshot ${SNAPSHOT_ID}\033[0m"
