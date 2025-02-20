#!/bin/bash

# Ensure restic is installed
if ! command -v restic &> /dev/null; then
    echo "restic could not be found, please install it first at https://restic.readthedocs.io/en/v0.16.4/020_installation.html. Exiting..."
    exit 1
fi

echo "Please select the environment:"
echo "1) Development"
echo "2) Production"
echo "3) Staging"

read -p "Enter your choice (1-3): " choice

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

CURRENT_DIR=$(pwd)

DOCKER_NAME="strohm_odoo"
DOCKER_NAME_DB="strohm_db"

# This is the directory where the backup was created
readonly BACKUP_DIR=/tmp/backup_odoo

RESTORE_DIR="$CURRENT_DIR$BACKUP_DIR"
RESTIC_REPOSITORY="/home/resticuser/backups-strohm/$ENV/odoo"

BACKUP_FILE="$RESTORE_DIR/odoo_db.sql"

# Check if restic remote is accessible
# Show available snapshots
echo "Available snapshots:"
if ! restic -r sftp:restic-backup-host:$RESTIC_REPOSITORY snapshots; then
    echo "Restic remote connection could not be established. Exiting..."
    exit 1
fi

read -p "Enter snapshot ID to restore: " SNAPSHOT_ID


# Restore from selected snapshot
if ! restic -r sftp:restic-backup-host:$RESTIC_REPOSITORY restore $SNAPSHOT_ID --target $CURRENT_DIR; then
    echo "Restore failed. Exiting..."
    exit 1
fi

source ../../.env
ODOO_DB=$ODOO_DB
ODOO_DB_USER=$ODOO_DB_USER
ODOO_DB_DEVELOPMENT_PASSWORD=$ODOO_DB_DEVELOPMENT_PASSWORD

# Check environment variables
if [ -z "$ODOO_DB" ] || [ -z "$ODOO_DB_DEVELOPMENT_PASSWORD" ]; then
    echo "Please set the ODOO_DB and ODOO_DB_DEVELOPMENT_PASSWORD in the .env file. Exiting..."
    exit 1
fi

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo "Backup file not found at $BACKUP_FILE. Exiting..."
    exit 1
fi

# Stop Odoo container
echo "Stopping Odoo container..."
docker stop $DOCKER_NAME

# Restore database
echo "Restoring database from file $BACKUP_FILE..."
docker exec -i "$DOCKER_NAME_DB" psql -U $ODOO_DB_USER -d $ODOO_DB < $BACKUP_FILE;
if [ $? -ne 0 ]; then
    echo "Database restore failed. Exiting..."
    docker start $DOCKER_NAME
    exit 1
fi

docker start $DOCKER_NAME

# Restore filestore
echo "Restoring filestore..."
if [ -d "$RESTORE_DIR/filestore" ]; then
    if [ -z "$(ls -A $RESTORE_DIR/filestore)" ]; then
        echo "Filestore directory exists but is empty, skipping..."
    else
        docker exec -u root -i $DOCKER_NAME rm -rf /var/lib/odoo/filestore
        if ! docker cp $RESTORE_DIR/filestore $DOCKER_NAME:/var/lib/odoo/; then
            echo "Filestore restore failed. Exiting..."
            docker start $DOCKER_NAME
            exit 1
        fi
        # set filestore permissions
        docker exec -u root -i $DOCKER_NAME chown -R odoo:odoo /var/lib/odoo/filestore
    fi
else
    echo "No filestore found in backup, skipping..."
fi

# Start Odoo container
echo "Starting Odoo container..."

# Cleanup
rm -r "$CURRENT_DIR"/tmp

echo -e "\033[32mSuccessfully restored Odoo database and filestore from snapshot $SNAPSHOT_ID\033[0m"