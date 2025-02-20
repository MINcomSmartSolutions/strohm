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

DOCKER_NAME="strohm_odoo"
DOCKER_NAME_DB="strohm_db"

CURRENT_DIR=$(pwd)

readonly DB_BACKUP_DIR=/tmp/backup_odoo

RESTIC_REPOSITORY="/home/resticuser/backups-strohm/$ENV/odoo"

RESTIC_PASSWORD=$RESTIC_PASSWORD

#check if restic remote is set
if ! restic -r sftp:restic-backup-host:$RESTIC_REPOSITORY snapshots;
then
  echo "Restic remote connection could not be established. Exiting..."
  exit 1
fi


mkdir -p $DB_BACKUP_DIR

source ../../.env
ODOO_DB_USER=$ODOO_DB_USER
ODOO_DB=$ODOO_DB
ODOO_DB_DEVELOPMENT_PASSWORD=$ODOO_DB_DEVELOPMENT_PASSWORD

#check the parameters if they are set
if [ -z "$ODOO_DB" ] || [ -z "$ODOO_DB_DEVELOPMENT_PASSWORD" ]; then
    echo "Please set the ODOO_DB and ODOO_DB_DEVELOPMENT_PASSWORD in the .env file. Exiting..."
    exit 1
fi

# pg_dump the database
if ! docker exec -t $DOCKER_NAME_DB pg_dump $ODOO_DB -U $ODOO_DB_USER --clean > $DB_BACKUP_DIR/odoo_db.sql; then
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
rm -rf $DB_BACKUP_DIR

echo -e "\033[32mSuccessfully backed up Odoo database and filestore to restic repository\033[0m"