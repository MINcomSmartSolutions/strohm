#!/bin/bash

# Script to restore dirty filestore into Odoo container
# This is specifically for local dirty backups, not restic-based backups

# Default values
DOCKER_NAME="odoo_user_test"
DIRTY_FILESTORE_PATH="./database/init.d/odoo/dirty/odoo_filestore"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --container-name)
            DOCKER_NAME="$2"
            shift 2
            ;;
        --filestore-path)
            DIRTY_FILESTORE_PATH="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [--container-name CONTAINER_NAME] [--filestore-path PATH]"
            echo "  --container-name  Name of the Odoo container (default: odoo_user_test)"
            echo "  --filestore-path  Path to dirty filestore (default: ./database/init.d/odoo/dirty/odoo_filestore)"
            echo "  -h, --help       Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Convert to absolute path if relative
if [[ "${DIRTY_FILESTORE_PATH}" != /* ]]; then
    DIRTY_FILESTORE_PATH="${PROJECT_ROOT}/${DIRTY_FILESTORE_PATH}"
fi

echo "Using Odoo container: ${DOCKER_NAME}"
echo "Using dirty filestore path: ${DIRTY_FILESTORE_PATH}"

# Check if dirty filestore exists
if [ ! -d "${DIRTY_FILESTORE_PATH}" ]; then
    echo "Error: Dirty filestore directory not found at ${DIRTY_FILESTORE_PATH}"
    echo "Please ensure the dirty filestore backup exists."
    exit 1
fi

# Check if directory has content
if [ -z "$(ls -A "${DIRTY_FILESTORE_PATH}")" ]; then
    echo "Warning: Dirty filestore directory is empty at ${DIRTY_FILESTORE_PATH}"
    echo "Continuing anyway..."
fi

# Check if container exists
if ! docker ps -a --format "table {{.Names}}" | grep -q "^${DOCKER_NAME}$"; then
    echo "Error: Container ${DOCKER_NAME} not found."
    echo "Please ensure the container exists."
    exit 1
fi

# Stop the container if it's running
if docker ps --format "table {{.Names}}" | grep -q "^${DOCKER_NAME}$"; then
    echo "Stopping container ${DOCKER_NAME}..."
    if ! docker stop "${DOCKER_NAME}"; then
        echo "Failed to stop container ${DOCKER_NAME}. Exiting..."
        exit 1
    fi
    echo "Container stopped successfully."
fi

echo "Restoring dirty filestore to container..."

# Copy dirty filestore to container (works on stopped containers)
echo "Copying dirty filestore to container..."
if ! docker cp "${DIRTY_FILESTORE_PATH}/." "${DOCKER_NAME}:/var/lib/odoo/"; then
    echo "Failed to copy dirty filestore to container. Exiting..."
    exit 1
fi

# restart the container
echo "Starting container ${DOCKER_NAME}..."
if ! docker start "${DOCKER_NAME}"; then
    echo "Failed to start container ${DOCKER_NAME}. Exiting..."
    exit 1
fi

# Set proper permissions
echo "Setting permissions..."
if ! docker exec -u root "${DOCKER_NAME}" chown -R odoo:odoo /var/lib/odoo; then
    echo "Warning: Failed to set filestore permissions. This may cause issues."
fi

echo "Dirty filestore restoration completed successfully!"
echo "The container ${DOCKER_NAME} now contains the restored filestore."
