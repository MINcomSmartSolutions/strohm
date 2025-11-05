#!/bin/bash

#  Backup Wrapper
# This script provides a bridge between production_action.sh and the proper backup scripts
# It uses the restic-based backup system for remote backups

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Source common utilities
# shellcheck source=/dev/null
source "$SCRIPT_DIR/common.sh"

# Default configuration
COMPOSE_FILE="${COMPOSE_FILE:-prod-docker-compose.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
BACKUP_ENV="${BACKUP_ENV:-development}"

usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Production backup wrapper that calls the proper backup scripts using restic

OPTIONS:
    -c, --compose-file FILE  Docker compose file (default: prod-docker-compose.yml)
    -e, --env-file FILE      Environment file (default: .env.prod)
    --environment ENV        Backup environment: development, staging, production (default: development)
    --strohmdb-only          Backup only Strohm database
    --odoo-only              Backup only Odoo database
    -h, --help               Show this help message

ENVIRONMENT VARIABLES:
    RESTIC_PASSWORD          Password for restic repository
    RESTIC_REPOSITORY        Base path for restic repositories
EOF
    exit 0
}

BACKUP_STROHM=true
BACKUP_ODOO=true

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -c|--compose-file)
            COMPOSE_FILE="$2"
            shift 2
            ;;
        -e|--env-file)
            ENV_FILE="$2"
            shift 2
            ;;
        --environment)
            BACKUP_ENV="$2"
            shift 2
            ;;
        --strohmdb-only)
            BACKUP_ODOO=false
            shift
            ;;
        --odoo-only)
            BACKUP_STROHM=false
            shift
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

cd "$PROJECT_ROOT"

# Check if compose file and env file exist
if [ ! -f "$COMPOSE_FILE" ]; then
    error "Docker compose file not found: $COMPOSE_FILE"
    exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
    error "Environment file not found: $ENV_FILE"
    exit 1
fi

# Load environment variables
load_env_file "$ENV_FILE"

# Determine container names from docker-compose
info "Detecting container names from docker-compose..."
COMPOSE_CMD=$(detect_docker_compose)

# Get container name prefix from compose file
COMPOSE_PROJECT=$(grep -E "^name:" "$COMPOSE_FILE" | awk '{print $2}' || basename "$PWD")
DB_CONTAINER="${COMPOSE_PROJECT}-db-1"
ODOO_CONTAINER="${COMPOSE_PROJECT}-odoo-1"

# Try to detect actual running containers
if docker ps --format '{{.Names}}' | grep -q "db"; then
    DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep "db" | head -1)
fi

if docker ps --format '{{.Names}}' | grep -q "odoo"; then
    ODOO_CONTAINER=$(docker ps --format '{{.Names}}' | grep "odoo" | head -1)
fi

info "Using containers: DB=$DB_CONTAINER, ODOO=$ODOO_CONTAINER"

# Export environment for child scripts
export COMPOSE_FILE
export ENV_FILE

backup_failed=0

# Backup Strohm database
if [ "$BACKUP_STROHM" = true ]; then
    info "=== Backing up Strohm database using restic (environment: $BACKUP_ENV) ==="

    # Use the proper backup script
    if bash "$SCRIPT_DIR/backup_strohm_db.sh" \
        -c "$DB_CONTAINER" \
        -u "$STROHM_DB_USER" \
        -d "$STROHM_DB" \
        -p "$STROHM_DB_PASSWORD" \
        -env "$BACKUP_ENV"; then
        success "Strohm database backed up to restic"
    else
        error "Restic backup failed for Strohm database"
        backup_failed=1
    fi
fi

# Backup Odoo database and filestore
if [ "$BACKUP_ODOO" = true ]; then
    info "=== Backing up Odoo database and filestore using restic (environment: $BACKUP_ENV) ==="

    # Use the proper backup script
    # The backup_odoo.sh script will prompt for environment, so we need to pass it via stdin
    # Map environment to choice number: development=1, staging=2, production=3
    env_choice=""
    case "$BACKUP_ENV" in
        development) env_choice="1" ;;
        staging) env_choice="2" ;;
        production) env_choice="3" ;;
        *) error "Invalid environment: $BACKUP_ENV"; backup_failed=1; ;;
    esac

    if echo "$env_choice" | bash "$SCRIPT_DIR/backup_odoo.sh" \
        --pg-container "$DB_CONTAINER" \
        --odoo-container "$ODOO_CONTAINER" \
        --user "$ODOO_DB_USER" \
        --environment "$BACKUP_ENV" \
        --database "$ODOO_DB"; then
        success "Odoo database and filestore backed up to restic"
    else
        error "Restic backup failed for Odoo"
        backup_failed=1
    fi
fi

# Summary
echo ""
if [ $backup_failed -eq 0 ]; then
    success "=== All backups completed successfully ==="
    info "Remote backups saved to restic repository"
    exit 0
else
    error "=== Backup completed with errors ==="
    exit 1
fi

