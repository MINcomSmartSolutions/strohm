#!/bin/bash

# Ensure restic is installed
if ! command -v restic &> /dev/null; then
    echo "restic could not be found, please install it first at https://restic.readthedocs.io/en/v0.16.4/020_installation.html. Exiting..."
    exit 1
fi


echo -e "\033[34mBacking up Odoo database and filestore...\033[0m"
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

DOCKER_NAME="strohm_odoo"
DOCKER_NAME_DB="strohm_db"
ODOO_DB="odoo"
DB_USER="postgres"

readonly DB_BACKUP_DIR=/tmp/backup_odoo

RESTIC_REPOSITORY="/home/resticuser/backups-strohm/$ENV/odoo"


#check if restic remote is set
if ! restic -r sftp:restic-backup-host:$RESTIC_REPOSITORY snapshots;
then
  echo "Restic remote connection could not be established. Exiting..."
  echo "Are you sure the restic remote is set up correctly, host is reachable?"
  echo "Do not forget to set RESTIC_PASSWORD environment variable before running this script."
  exit 1
fi


mkdir -p "$DB_BACKUP_DIR"


# pg_dump the database
if ! docker exec -t $DOCKER_NAME_DB pg_dump $ODOO_DB -U $DB_USER --clean > $DB_BACKUP_DIR/odoo_db.sql; then
    echo "Database backup failed. Exiting..."
    exit 1
fi

# backup filestore if it exists
if docker exec $DOCKER_NAME test -d /var/lib/odoo/filestore; then
    if ! docker cp $DOCKER_NAME:/var/lib/odoo/filestore $DB_BACKUP_DIR/; then
        echo "Filestore backup failed. Exiting..."
        exit 1
    fi
else
    echo "Filestore directory does not exist, skipping filestore backup..."
fi


if ! restic -r sftp:restic-backup-host:$RESTIC_REPOSITORY backup $DB_BACKUP_DIR;
then
  echo "Restic backup failed. Exiting..."
  exit 1
fi

# Cleanup
if [ -d "$DB_BACKUP_DIR" ]; then
    rm -rf "$DB_BACKUP_DIR"
fi

echo -e "\033[32mSuccessfully backed up Odoo database and filestore to restic repository\033[0m"