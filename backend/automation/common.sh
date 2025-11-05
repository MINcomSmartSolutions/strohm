#!/bin/bash

# Common functions and utilities for backup/restore scripts
# This file provides a unified interface for working with both production_action.sh
# and the automation scripts (backup_odoo.sh, backup_strohm_db.sh, etc.)

set -euo pipefail

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Logging functions
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

# Detect if we're using docker-compose or docker compose
detect_docker_compose() {
    if docker compose version >/dev/null 2>&1; then
        echo "docker compose"
    elif command -v docker-compose >/dev/null 2>&1; then
        echo "docker-compose"
    else
        error "Neither 'docker compose' nor 'docker-compose' found"
        exit 1
    fi
}

# Get the appropriate docker compose command
get_compose_cmd() {
    local compose_file="${1:-.}"
    local env_file="${2:-.env}"

    if docker compose version >/dev/null 2>&1; then
        if [ -f "$env_file" ]; then
            echo "docker compose -f $compose_file --env-file $env_file"
        else
            echo "docker compose -f $compose_file"
        fi
    else
        if [ -f "$env_file" ]; then
            echo "docker-compose -f $compose_file --env-file $env_file"
        else
            echo "docker-compose -f $compose_file"
        fi
    fi
}

# Execute a command in a docker compose container
compose_exec() {
    local compose_file="${1:-.}"
    local service="$2"
    shift 2
    local compose_cmd=$(get_compose_cmd "$compose_file")

    $compose_cmd exec -T "$service" "$@"
}

# Check if a docker compose service exists and is running
service_is_running() {
    local compose_file="${1:-.}"
    local service="$2"
    local compose_cmd=$(get_compose_cmd "$compose_file")

    $compose_cmd ps "$service" 2>/dev/null | grep -q "Up" || return 1
}

# Load environment variables from file
load_env_file() {
    local env_file="$1"

    if [ ! -f "$env_file" ]; then
        error "Environment file not found: $env_file"
        return 1
    fi

    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
}

# Validate required environment variables
validate_required_vars() {
    local -a required_vars=("$@")

    for var in "${required_vars[@]}"; do
        if [ -z "${!var:-}" ]; then
            error "Required environment variable '$var' is not set"
            return 1
        fi
    done

    return 0
}

# Create a timestamp for backup naming
get_backup_timestamp() {
    date +%Y%m%d_%H%M%S
}

# Check if docker daemon is running
check_docker_daemon() {
    if ! docker info >/dev/null 2>&1; then
        error "Docker daemon is not running"
        return 1
    fi
    return 0
}

# Check required tools
check_required_tools() {
    local -a tools=("$@")

    for tool in "${tools[@]}"; do
        if ! command -v "$tool" &>/dev/null; then
            error "$tool is not installed or not in PATH"
            return 1
        fi
    done

    return 0
}

# Wait for a docker compose service to be healthy
wait_for_service() {
    local compose_file="${1:-.}"
    local service="$2"
    local max_attempts="${3:-30}"
    local attempt=1

    info "Waiting for $service to be ready..."

    while [ $attempt -le $max_attempts ]; do
        if service_is_running "$compose_file" "$service"; then
            success "$service is ready"
            return 0
        fi

        echo "Attempt $attempt/$max_attempts: $service not ready yet..."
        sleep 2
        ((attempt++))
    done

    error "$service did not become ready in time"
    return 1
}

# Convert absolute path to relative if possible
make_relative_path() {
    local path="$1"
    local base="${2:-.}"

    if [[ "$path" == /* ]]; then
        # Try to make it relative to base
        python3 -c "import os.path; print(os.path.relpath('$path', '$base'))" 2>/dev/null || echo "$path"
    else
        echo "$path"
    fi
}

# Find the production compose file
find_production_compose() {
    local search_dir="${1:-.}"

    # Check in order of preference
    for file in "$search_dir"/prod-docker-compose.yml "$search_dir"/docker-compose.yml; do
        if [ -f "$file" ]; then
            echo "$file"
            return 0
        fi
    done

    return 1
}

# Find the production env file
find_production_env() {
    local search_dir="${1:-.}"

    # Check in order of preference
    for file in "$search_dir"/.env.prod "$search_dir"/.env.production "$search_dir"/.env; do
        if [ -f "$file" ]; then
            echo "$file"
            return 0
        fi
    done

    return 1
}

export -f error success warning info
export -f detect_docker_compose get_compose_cmd compose_exec service_is_running
export -f load_env_file validate_required_vars get_backup_timestamp
export -f check_docker_daemon check_required_tools wait_for_service
export -f make_relative_path find_production_compose find_production_env

