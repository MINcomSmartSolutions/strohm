#!/bin/bash

#  Restore Wrapper
# This script provides a bridge between production_action.sh and the proper restore scripts
# It uses the restic-based restore system for remote backups

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Source common utilities
# shellcheck source=/dev/null
source "$SCRIPT_DIR/common.sh"

# Default configuration
COMPOSE_FILE="${COMPOSE_FILE:-prod-docker-compose.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
RESTORE_ENV="${RESTORE_ENV:-production}"
SNAPSHOT_ID=""
CLEAN_RESTORE=false

usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Production restore wrapper that calls the proper restore scripts using restic

OPTIONS:
    -c, --compose-file FILE  Docker compose file (default: prod-docker-compose.yml)
    -e, --env-file FILE      Environment file (default: .env.prod)
    --environment ENV        Restore environment: development, staging, production (default: production)
    --snapshot ID            Snapshot ID
    --clean                  Clean restore (drop and recreate databases)
    --strohmdb-only          Restore only Strohm database
    --odoo-only              Restore only Odoo database
    -h, --help               Show this help message

ENVIRONMENT VARIABLES:
    RESTIC_PASSWORD          Password for restic repository
EOF
    exit 0
}

RESTORE_STROHM=true
RESTORE_ODOO=true

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
            RESTORE_ENV="$2"
            shift 2
            ;;
        --snapshot)
            SNAPSHOT_ID="$2"
            shift 2
            ;;
        --clean)
            CLEAN_RESTORE=true
            shift
            ;;
        --strohmdb-only)
            RESTORE_ODOO=false
            shift
            ;;
        --odoo-only)
            RESTORE_STROHM=false
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
if docker ps --format '{{.Names}}' | grep -q "strohm_db"; then
    DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep "db" | head -1)
fi

if docker ps --format '{{.Names}}' | grep -q "strohm_odoo"; then
    ODOO_CONTAINER=$(docker ps --format '{{.Names}}' | grep "odoo" | head -1)
fi

info "Using containers: DB=$DB_CONTAINER, ODOO=$ODOO_CONTAINER"

# Confirmation
warning "==================================================================="
warning "WARNING: This will restore databases from restic (environment: $RESTORE_ENV)"
if [ "$CLEAN_RESTORE" = true ]; then
    warning "Existing databases will be DROPPED and RECREATED!"
fi
warning "==================================================================="
echo ""

read -r -p "Are you sure you want to continue? (y/n): " confirmation
if [ "$confirmation" != "y" ]; then
    echo "Restore cancelled."
    exit 0
fi

# Export environment for child scripts
export COMPOSE_FILE
export ENV_FILE

restore_failed=0

# Restore Strohm database
if [ "$RESTORE_STROHM" = true ]; then
    info "=== Restoring Strohm database from restic (environment: $RESTORE_ENV) ==="

    # Map environment to choice number for the restore script
    env_choice=""
    case "$RESTORE_ENV" in
        development) env_choice="1" ;;
        staging) env_choice="2" ;;
        production) env_choice="3" ;;
        *) error "Invalid environment: $RESTORE_ENV"; exit 1 ;;
    esac

    # Build restore arguments
    restore_args="-c $DB_CONTAINER -u $STROHM_DB_USER -d $STROHM_DB -p $STROHM_DB_PASSWORD"
    if [ "$CLEAN_RESTORE" = true ]; then
        restore_args="$restore_args --clean"
    fi
    if [ -n "$SNAPSHOT_ID" ]; then
        restore_args="$restore_args -s $SNAPSHOT_ID"
    fi

    # Use the proper restore script
    if echo "$env_choice" | bash "$SCRIPT_DIR/restore_strohm_db.sh" $restore_args; then
        success "Strohm database restored from restic"
    else
        error "Restic restore failed for Strohm database"
        restore_failed=1
    fi
fi

# Restore Odoo database and filestore
if [ "$RESTORE_ODOO" = true ]; then
    info "=== Restoring Odoo database and filestore from restic (environment: $RESTORE_ENV) ==="

    # Map environment to choice number for the restore script
    env_choice=""
    case "$RESTORE_ENV" in
        development) env_choice="1" ;;
        staging) env_choice="2" ;;
        production) env_choice="3" ;;
        *) error "Invalid environment: $RESTORE_ENV"; exit 1 ;;
    esac

    # Build restore arguments
    restore_args="-c $DB_CONTAINER -o $ODOO_CONTAINER -u $ODOO_DB_USER -d $ODOO_DB"
    if [ -n "$SNAPSHOT_ID" ]; then
        restore_args="$restore_args -s $SNAPSHOT_ID"
    fi

    # Use the proper restore script
    if echo "$env_choice" | bash "$SCRIPT_DIR/restore_odoo.sh" $restore_args; then
        success "Odoo database and filestore restored from restic"
    else
        error "Restic restore failed for Odoo"
        restore_failed=1
    fi
fi

# Summary
echo ""
if [ $restore_failed -eq 0 ]; then
    success "=== All restores completed successfully ==="
    warning "Please restart services for changes to take effect:"
    exit 0
else
    error "=== Restore completed with errors ==="
    exit 1
fi

