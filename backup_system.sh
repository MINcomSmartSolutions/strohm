#!/bin/bash

# System Backup Script for Strohm Project
# Backs up PostgreSQL (strohm, odoo) and MariaDB (steve) databases
# Supports both dirty (with data) and clean (schema only) backups
# Can create Docker Compose init.d compatible backups

set -e

#TODO: Create admin api token in odoo after init both in clean and dirty mode with the same password


# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default Configuration (can be overridden)
DEFAULT_BACKUP_DIR="./database/backups"
DEFAULT_INITD_DIR="./database/init.d"
DEFAULT_PG_INITD_DIR="./database/init.d/postgresql"
DEFAULT_MARIA_INITD_DIR="./database/init.d/mariadb"
DEFAULT_PG_HOST="localhost"
DEFAULT_PG_PORT="5432"
DEFAULT_PG_USER="postgres"
DEFAULT_PG_PASSWORD="testpassword"
DEFAULT_STROHM_DB="strohm"
DEFAULT_ODOO_DB="odoo"
DEFAULT_MARIA_HOST="localhost"
DEFAULT_MARIA_PORT="3306"
DEFAULT_MARIA_USER="steve"
DEFAULT_MARIA_PASSWORD="changeme"
DEFAULT_STEVE_DB="stevedb"
BASE_BACKUP_TYPE="dirty" # Default backup type

# Function to load configuration from file
load_config() {
    local config_file=""

    # Check for custom config file passed as argument
    if [ -n "$CONFIG_FILE" ]; then
        config_file="$CONFIG_FILE"
    # Check for environment-specific config
    elif [ -n "$BACKUP_ENV" ]; then
        config_file="./backup_config_${BACKUP_ENV}.env"
    # Check for default config file
    elif [ -f "./backup_config.env" ]; then
        config_file="./backup_config.env"
    # Check for .env file
    elif [ -f "./.env" ]; then
        config_file="./.env"
    fi

    if [ -n "$config_file" ] && [ -f "$config_file" ]; then
        print_status "Loading configuration from: $config_file"
        # Source the config file, ignoring comments and empty lines
        set -a  # automatically export all variables
        source "$config_file"
        set +a
    else
        print_status "No configuration file found, using defaults"
    fi
}

# Function to set configuration variables with fallback hierarchy
set_config_variables() {
    # Configuration hierarchy: CLI args > Environment vars > Config file > Defaults

    # Backup directories
    BACKUP_DIR="${BACKUP_DIR:-$DEFAULT_BACKUP_DIR}"
    INITD_DIR="${INITD_DIR:-$DEFAULT_INITD_DIR}"

    # PostgreSQL configuration
    PG_HOST="${PG_HOST:-$DEFAULT_PG_HOST}"
    PG_PORT="${PG_PORT:-$DEFAULT_PG_PORT}"
    PG_USER="${PG_USER:-$DEFAULT_PG_USER}"
    PG_PASSWORD="${PG_PASSWORD:-$DEFAULT_PG_PASSWORD}"
    STROHM_DB="${STROHM_DB:-$DEFAULT_STROHM_DB}"
    ODOO_DB="${ODOO_DB:-$DEFAULT_ODOO_DB}"

    # MariaDB configuration
    MARIA_HOST="${MARIA_HOST:-$DEFAULT_MARIA_HOST}"
    MARIA_PORT="${MARIA_PORT:-$DEFAULT_MARIA_PORT}"
    MARIA_USER="${MARIA_USER:-$DEFAULT_MARIA_USER}"
    MARIA_PASSWORD="${MARIA_PASSWORD:-$DEFAULT_MARIA_PASSWORD}"
    STEVE_DB="${STEVE_DB:-$DEFAULT_STEVE_DB}"

    # Docker container names (will be auto-detected if empty)
    PG_CONTAINER="${PG_CONTAINER:-}"
    MARIA_CONTAINER="${MARIA_CONTAINER:-}"
    ODOO_CONTAINER="${ODOO_CONTAINER:-}"

    # Set timestamp
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
}

# Function to parse command line arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --config)
                CONFIG_FILE="$2"
                shift 2
                ;;
            --env)
                BACKUP_ENV="$2"
                shift 2
                ;;
            --pg-host)
                PG_HOST="$2"
                shift 2
                ;;
            --pg-port)
                PG_PORT="$2"
                shift 2
                ;;
            --pg-user)
                PG_USER="$2"
                shift 2
                ;;
            --pg-password)
                PG_PASSWORD="$2"
                shift 2
                ;;
            --maria-host)
                MARIA_HOST="$2"
                shift 2
                ;;
            --maria-port)
                MARIA_PORT="$2"
                shift 2
                ;;
            --maria-user)
                MARIA_USER="$2"
                shift 2
                ;;
            --maria-password)
                MARIA_PASSWORD="$2"
                shift 2
                ;;
            --backup-dir)
                BACKUP_DIR="$2"
                shift 2
                ;;
            --initd-dir)
                INITD_DIR="$2"
                shift 2
                ;;
            --pg-container)
                PG_CONTAINER="$2"
                shift 2
                ;;
            --maria-container)
                MARIA_CONTAINER="$2"
                shift 2
                ;;
            --odoo-container)
                ODOO_CONTAINER="$2"
                shift 2
                ;;
            --help|-h)
                show_usage
                exit 0
                ;;
            dirty|clean|initd-dirty|initd-clean|list)
                # These are valid commands, will be handled by main()
                BACKUP_COMMAND="$1"
                shift
                ;;
            *)
                print_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
}

# Function to validate configuration
validate_config() {
    local errors=0

    # Check required directories
    if [ ! -d "$(dirname "$BACKUP_DIR")" ]; then
        print_error "Backup directory parent does not exist: $(dirname "$BACKUP_DIR")"
        errors=$((errors + 1))
    fi

    if [ ! -d "$(dirname "$INITD_DIR")" ]; then
        print_error "Init.d directory parent does not exist: $(dirname "$INITD_DIR")"
        errors=$((errors + 1))
    fi

    # Check database connection parameters
    if [ -z "$PG_HOST" ] || [ -z "$PG_PORT" ] || [ -z "$PG_USER" ] || [ -z "$PG_PASSWORD" ]; then
        print_error "PostgreSQL connection parameters are incomplete"
        errors=$((errors + 1))
    fi

    if [ -z "$MARIA_HOST" ] || [ -z "$MARIA_PORT" ] || [ -z "$MARIA_USER" ] || [ -z "$MARIA_PASSWORD" ]; then
        print_error "MariaDB connection parameters are incomplete"
        errors=$((errors + 1))
    fi

    # Check database names
    if [ -z "$STROHM_DB" ] || [ -z "$ODOO_DB" ] || [ -z "$STEVE_DB" ]; then
        print_error "Database names are incomplete"
        errors=$((errors + 1))
    fi

    if [ $errors -gt 0 ]; then
        print_error "Configuration validation failed with $errors errors"
        return 1
    fi

    return 0
}

# Function to show current configuration
show_config() {
    print_status "Current Configuration:"
    echo "  Backup Type: $BASE_BACKUP_TYPE"
    echo "  Backup Directory: $BACKUP_DIR"
    echo "  Init.d Directory: $INITD_DIR"
    echo "  PostgreSQL: $PG_USER@$PG_HOST:$PG_PORT"
    echo "  MariaDB: $MARIA_USER@$MARIA_HOST:$MARIA_PORT"
    echo "  Databases: $STROHM_DB, $ODOO_DB, $STEVE_DB"

    if [ -n "$PG_CONTAINER" ]; then
        echo "  PostgreSQL Container: $PG_CONTAINER"
    fi

    if [ "$BASE_BACKUP_TYPE" = "dirty" ]; then
        if [ -n "$MARIA_CONTAINER" ]; then
            echo "  MariaDB Container: $MARIA_CONTAINER"
        fi

        if [ -n "$ODOO_CONTAINER" ]; then
            echo "  Odoo Container: $ODOO_CONTAINER"
        fi
    fi
    echo ""
}

# Function to detect running containers
detect_containers() {
    # Try to find PostgreSQL container
    for container in "strohm_db" "odoo_user_test_db" "postgres"; do
        if docker ps --format "table {{.Names}}" | grep -q "^${container}$"; then
            PG_CONTAINER="$container"
            break
        fi
    done


    if [ -z "$PG_CONTAINER" ]; then
        print_error "No PostgreSQL container found running"
        return 1
    fi
    print_status "Detected PostgreSQL container: $PG_CONTAINER"


    if [ "$BASE_BACKUP_TYPE" = "dirty" ]; then
        # Try to find containers
        for container in "steve_sim_db" "steve_user_test_db" "mariadb"; do
            if docker ps --format "table {{.Names}}" | grep -q "^${container}$"; then
                MARIA_CONTAINER="$container"
                break
            fi
        done

        for container in "odoo" "strohm_odoo"; do
            if docker ps --format "table {{.Names}}" | grep -q "^${container}$"; then
                ODOO_CONTAINER="$container"
                break
            fi
        done

        if [ -z "$MARIA_CONTAINER" ]; then
                print_error "No MariaDB container found running"
                return 1
        fi

        if [ -z "$ODOO_CONTAINER" ]; then
                print_error "No Odoo container found running"
                return 1
        fi

        print_status "Detected MariaDB container: $MARIA_CONTAINER"
        print_status "Detected Odoo container: $ODOO_CONTAINER"
    fi
}

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}


# Function to check if Docker container is running
check_container() {
    local container_name=$1
    if ! docker ps --format "table {{.Names}}" | grep -q "^${container_name}$"; then
        print_error "Container ${container_name} is not running!"
    fi
  }

# Function to safely clean directory contents
safe_clean_directory() {
    local dir_path=$1
    local dir_description=$2

    # Validate input parameters
    if [ -z "$dir_path" ]; then
        print_warning "Directory path is empty, nothing to clean."
        return 0
    fi

    if [ -z "$dir_description" ]; then
        dir_description="directory"
    fi

    # Normalize path to prevent issues with relative paths
    local normalized_path=$(realpath "$dir_path" 2>/dev/null || echo "$dir_path")

    # Safety checks to prevent accidental deletion of important directories
    case "$normalized_path" in
        "/" | "/bin" | "/boot" | "/dev" | "/etc" | "/home" | "/lib" | "/lib64" | "/media" | "/mnt" | "/opt" | "/proc" | "/root" | "/run" | "/sbin" | "/srv" | "/sys" | "/tmp" | "/usr" | "/var")
            print_error "safe_clean_directory: Refusing to clean system directory: $normalized_path"
            return 1
            ;;
        "")
            print_error "safe_clean_directory: Empty or invalid directory path"
            return 1
            ;;
        *"/.."* | *"/../"*)
            print_error "safe_clean_directory: Directory path contains dangerous '..' components: $normalized_path"
            return 1
            ;;
    esac

    # Check if directory exists
    if [ ! -d "$dir_path" ]; then
        print_warning "safe_clean_directory: ${dir_description} does not exist: $dir_path"
        return 0
    fi

    # Additional safety check: ensure the directory is within expected backup/init.d paths
    if [[ "$normalized_path" != *"/backup"* ]] && [[ "$normalized_path" != *"/init.d"* ]] && [[ "$normalized_path" != *"/database"* ]]; then
        print_error "safe_clean_directory: Directory path appears to be outside expected backup/database directories: $normalized_path"
        return 1
    fi

    # Check if directory is writable
    if [ ! -w "$dir_path" ]; then
        print_error "safe_clean_directory: No write permission for ${dir_description}: $dir_path"
        return 1
    fi

    # Safely remove only regular files (not directories or special files)
    local files_removed=0
    print_status "Cleaning ${dir_description}: $dir_path"

    # Use find with proper safety checks
    if command -v find >/dev/null 2>&1; then
        # Use find to safely remove only regular files
        local file_count=$(find "$dir_path" -maxdepth 1 -type f -name "*" | wc -l)
        if [ "$file_count" -gt 0 ]; then
            find "$dir_path" -maxdepth 1 -type f -name "*" -delete
            files_removed=$file_count
            print_success "Removed $files_removed files from ${dir_description}"
        else
            print_status "No files to remove from ${dir_description}"
        fi
    else
        # Fallback method using shell globbing with safety checks
        local files_found=false
        for file in "$dir_path"/*; do
            if [ -f "$file" ]; then
                if rm -f "$file" 2>/dev/null; then
                    files_removed=$((files_removed + 1))
                    files_found=true
                else
                    print_warning "Failed to remove file: $file"
                fi
            fi
        done

        if [ "$files_found" = true ]; then
            print_success "Removed $files_removed files from ${dir_description}"
        else
            print_status "No files to remove from ${dir_description}"
        fi
    fi

    return 0
}

# Function to create backup directory
create_backup_dir() {
    local backup_type=$1
    local backup_subdir="${BACKUP_DIR}/${backup_type}_${TIMESTAMP}"
    mkdir -p "$backup_subdir"
    echo "$backup_subdir"
}

# Function to backup PostgreSQL database with data
backup_postgres_dirty() {
    local db_name=$1
    local backup_dir=$2
    local backup_file="${backup_dir}/${db_name}_dirty_${TIMESTAMP}.sql"

    print_status "Creating dirty backup of PostgreSQL database: ${db_name}"

    docker exec -e PGPASSWORD="${PG_PASSWORD}" "${PG_CONTAINER}" \
        pg_dump -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${db_name}" \
         --clean --if-exists --create > "${backup_file}"

    if [ $? -eq 0 ]; then
        print_success "PostgreSQL ${db_name} dirty backup completed: ${backup_file}"
        return 0
    else
        print_error "Failed to create PostgreSQL ${db_name} dirty backup"
        return 1
    fi
}

# Function to backup PostgreSQL database schema only
backup_postgres_clean() {
    local db_name=$1
    local backup_dir=$2
    local backup_file="${backup_dir}/${db_name}_clean_${TIMESTAMP}.sql"

    print_status "Creating clean backup of PostgreSQL database: ${db_name}"

    docker exec -e PGPASSWORD="${PG_PASSWORD}" "${PG_CONTAINER}" \
        pg_dump -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${db_name}" \
        --clean --if-exists --create --schema-only > "${backup_file}"

    if [ $? -eq 0 ]; then
        print_success "PostgreSQL ${db_name} clean backup completed: ${backup_file}"
        return 0
    else
        print_error "Failed to create PostgreSQL ${db_name} clean backup"
        return 1
    fi
}

# Function to backup MariaDB database with data
backup_maria_dirty() {
    local db_name=$1
    local backup_dir=$2
    local backup_file="${backup_dir}/${db_name}_dirty_${TIMESTAMP}.sql"

    print_status "Creating dirty backup of MariaDB database: ${db_name}"

    docker exec "${MARIA_CONTAINER}" \
        mysqldump -h "${MARIA_HOST}" -P "${MARIA_PORT}" -u "${MARIA_USER}" -p"${MARIA_PASSWORD}" \
        --single-transaction --routines --triggers --databases "${db_name}" > "${backup_file}"

    if [ $? -eq 0 ]; then
        print_success "MariaDB ${db_name} dirty backup completed: ${backup_file}"
        return 0
    else
        print_error "Failed to create MariaDB ${db_name} dirty backup"
        return 1
    fi
}

# Function to backup MariaDB database schema only
backup_maria_clean() {
    local db_name=$1
    local backup_dir=$2
    local backup_file="${backup_dir}/${db_name}_clean_${TIMESTAMP}.sql"

    print_status "Creating clean backup of MariaDB database: ${db_name}"

    docker exec "${MARIA_CONTAINER}" \
        mysqldump -h "${MARIA_HOST}" -P "${MARIA_PORT}" -u "${MARIA_USER}" -p"${MARIA_PASSWORD}" \
        --single-transaction --no-data --routines --triggers --databases "${db_name}" > "${backup_file}"

    if [ $? -eq 0 ]; then
        print_success "MariaDB ${db_name} clean backup completed: ${backup_file}"
        return 0
    else
        print_error "Failed to create MariaDB ${db_name} clean backup"
        return 1
    fi
}

# Function to backup PostgreSQL roles and global objects
backup_postgres_globals() {
    local backup_dir=$1
    local backup_file="${backup_dir}/postgres_globals_${TIMESTAMP}.sql"

    print_status "Creating backup of PostgreSQL global objects (roles, tablespaces, etc.)"

    docker exec -e PGPASSWORD="${PG_PASSWORD}" "${PG_CONTAINER}" \
        pg_dumpall -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" \
        --globals-only --verbose > "${backup_file}"

    if [ $? -eq 0 ]; then
        print_success "PostgreSQL globals backup completed: ${backup_file}"
        return 0
    else
        print_error "Failed to create PostgreSQL globals backup"
        return 1
    fi
}

# Function to create a complete system backup
create_system_backup() {
    local backup_type=$1

    print_status "Starting ${backup_type} system backup..."

    # Check if required containers are running
    if ! check_container "${PG_CONTAINER}"; then
        exit 1
    fi

    # Create backup directory
    local backup_dir
    backup_dir=$(create_backup_dir "${backup_type}")

    # Backup PostgreSQL globals
    if ! backup_postgres_globals "${backup_dir}"; then
        exit 1
    fi

    # Backup databases based on type
    if [ "$backup_type" = "dirty" ]; then

          if ! check_container "${MARIA_CONTAINER}"; then
              exit 1
          fi

          if ! check_container "${ODOO}"; then
              exit 1
          fi

        # Backup with data
        backup_postgres_dirty "${STROHM_DB}" "${backup_dir}"
        backup_postgres_dirty "${ODOO_DB}" "${backup_dir}"
        #TODO: Backup Odoo filestore
        backup_maria_dirty "${STEVE_DB}" "${backup_dir}"
            # Create a manifest file
            local manifest_file="${backup_dir}/backup_manifest.txt"
            cat > "${manifest_file}" << EOF
        Backup Type: ${backup_type}
        Timestamp: ${TIMESTAMP}
        Date: $(date)
        Host: $(hostname)
        PostgreSQL Version: $(docker exec "${PG_CONTAINER}" psql --version | head -n1)
        MariaDB Version: $(docker exec "${MARIA_CONTAINER}" mysql --version | head -n1)
        Odoo Version: $(docker exec "${ODOO_CONTAINER}" odoo --version | head -n1)

        Files included:
        $(ls -la "${backup_dir}")

        Container Status:
        PostgreSQL Container: ${PG_CONTAINER} - $(docker ps --format "table {{.Names}}\t{{.Status}}" | grep "${PG_CONTAINER}")
        MariaDB Container: ${MARIA_CONTAINER} - $(docker ps --format "table {{.Names}}\t{{.Status}}" | grep "${MARIA_CONTAINER}")
        Odoo Container: ${ODOO_CONTAINER} - $(docker ps --format "table {{.Names}}\t{{.Status}}" | grep "${ODOO_CONTAINER}")
EOF

    elif [ "$backup_type" = "clean" ]; then
        # Backup schema only (ONLY PostgreSQL strohm, skip odoo and MariaDB)
        backup_postgres_clean "${STROHM_DB}" "${backup_dir}"

        # Odoo expects a database to initilize
        odoo_createdb_sql_file "${backup_dir}"

            # Create a manifest file
        local manifest_file="${backup_dir}/backup_manifest.txt"
        cat > "${manifest_file}" << EOF
        Backup Type: ${backup_type}
        Timestamp: ${TIMESTAMP}
        Date: $(date)
        Host: $(hostname)
        PostgreSQL Version: $(docker exec "${PG_CONTAINER}" psql --version | head -n1)

        Files included:
        $(ls -la "${backup_dir}")

        Container Status:
        PostgreSQL Container: ${PG_CONTAINER} - $(docker ps --format "table {{.Names}}\t{{.Status}}" | grep "${PG_CONTAINER}")
EOF

        print_warning "Skipping MariaDB clean backup as only PostgreSQL (strohm), and Odoo create db is required for clean backups."
    fi


    print_success "System backup completed successfully!"
    print_success "Backup location: ${backup_dir}"
    print_success "Manifest file: ${manifest_file}"
}

# Function to create init.d compatible backup directories
create_initd_backup_dirs() {
    local backup_type=$1
    local pg_backup_dir="${INITD_DIR}/postgresql/${backup_type}"
    local maria_backup_dir="${INITD_DIR}/mariadb/${backup_type}"
    local odoo_backup_dir="${INITD_DIR}/odoo/${backup_type}"

    if [ "$backup_type" = "dirty" ]; then
        mkdir -p "$pg_backup_dir"
        mkdir -p "$maria_backup_dir"
        mkdir -p "$odoo_backup_dir"
        echo "$pg_backup_dir|$maria_backup_dir|$odoo_backup_dir"
    elif [ "$backup_type" = "clean" ]; then
        mkdir -p "$pg_backup_dir"
        echo "$pg_backup_dir"
    else
        print_error "Invalid backup type: $backup_type. Use 'dirty' or 'clean'."
        exit 1
    fi
}

# Function to backup PostgreSQL database for init.d (with data)
backup_postgres_initd_dirty() {
    local db_name=$1
    local backup_dir=$2
    local backup_file="${backup_dir}/${db_name}_data.sql"

    print_status "Creating init.d dirty backup of PostgreSQL database: ${db_name}"

    docker exec -e PGPASSWORD="${PG_PASSWORD}" "${PG_CONTAINER}" \
        pg_dump -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${db_name}" \
         --clean --if-exists --create > "${backup_file}"

    if [ $? -eq 0 ]; then
        print_success "PostgreSQL ${db_name} init.d dirty backup completed: ${backup_file}"
        return 0
    else
        print_error "Failed to create PostgreSQL ${db_name} init.d dirty backup"
        return 1
    fi
}

# Function to backup PostgreSQL database for init.d (schema only)
backup_postgres_initd_clean() {
    local db_name=$1
    local backup_dir=$2
    local backup_file="${backup_dir}/${db_name}_schema.sql"

    print_status "Creating init.d clean backup of PostgreSQL database: ${db_name}"

    docker exec -e PGPASSWORD="${PG_PASSWORD}" "${PG_CONTAINER}" \
        pg_dump -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${db_name}" \
         --clean --if-exists --create --schema-only > "${backup_file}"

    if [ $? -eq 0 ]; then
        print_success "PostgreSQL ${db_name} init.d clean backup completed: ${backup_file}"
        return 0
    else
        print_error "Failed to create PostgreSQL ${db_name} init.d clean backup"
        return 1
    fi
}

# Function to backup PostgreSQL roles and global objects for init.d
backup_postgres_initd_globals() {
    local backup_dir=$1
    local backup_file="${backup_dir}/00_postgres_globals.sql"

    print_status "Creating init.d backup of PostgreSQL global objects (roles, tablespaces, etc.)"

    docker exec -e PGPASSWORD="${PG_PASSWORD}" "${PG_CONTAINER}" \
        pg_dumpall -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" \
        --globals-only --verbose > "${backup_file}"

    if [ $? -eq 0 ]; then
        print_success "PostgreSQL globals init.d backup completed: ${backup_file}"
        return 0
    else
        print_error "Failed to create PostgreSQL globals init.d backup"
        return 1
    fi
}

odoo_createdb_sql_file(){
    print_status "Creating Odoo database creation script for init.d"
    local backup_dir=$1
    local backup_file="${backup_dir}/01_odoo_createdb.sql"

    cat > "${backup_file}" << EOF
DROP DATABASE IF EXISTS odoo;

-- Create a database
CREATE DATABASE odoo;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE odoo TO odoo_admin ;

-- Connect to the new database
\connect odoo;

-- Grant privileges on the public schema
GRANT ALL ON SCHEMA public TO odoo_admin;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO odoo_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO odoo_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO odoo_admin;

EOF
}

backup_odoo_initd_dirty() {
    local backup_dir=$1

    print_status "Creating filestore copy of Odoo"

    #  filestore
    docker cp "${ODOO_CONTAINER}":/var/lib/odoo "${backup_dir}/odoo_filestore"


    if [ $? -eq 0 ]; then
        print_success "Odoo filestore copy completed: ${backup_dir}/odoo_filestore"
        return 0
    else
        print_error "Failed to create Odoo filestore copy"
        return 1
    fi
}

# Function to create MariaDB backup for init.d (with data)
backup_maria_initd_dirty() {
    local db_name=$1
    local backup_dir=$2
    local backup_file="${backup_dir}/${db_name}_data.sql"

    print_status "Creating init.d dirty backup of MariaDB database: ${db_name}"

    docker exec "${MARIA_CONTAINER}" \
        mysqldump -h "${MARIA_HOST}" -P "${MARIA_PORT}" -u "${MARIA_USER}" -p"${MARIA_PASSWORD}" \
        --single-transaction --routines --triggers --databases "${db_name}" > "${backup_file}"

    if [ $? -eq 0 ]; then
        print_success "MariaDB ${db_name} init.d dirty backup completed: ${backup_file}"
        return 0
    else
        print_error "Failed to create MariaDB ${db_name} init.d dirty backup"
        return 1
    fi
}

# Function to create MariaDB backup for init.d (schema only)
backup_maria_initd_clean() {
    local db_name=$1
    local backup_dir=$2
    local backup_file="${backup_dir}/${db_name}_schema.sql"

    print_status "Creating init.d clean backup of MariaDB database: ${db_name}"

    docker exec "${MARIA_CONTAINER}" \
        mysqldump -h "${MARIA_HOST}" -P "${MARIA_PORT}" -u "${MARIA_USER}" -p"${MARIA_PASSWORD}" \
        --single-transaction --no-data --routines --triggers --databases "${db_name}" > "${backup_file}"

    if [ $? -eq 0 ]; then
        print_success "MariaDB ${db_name} init.d clean backup completed: ${backup_file}"
        return 0
    else
        print_error "Failed to create MariaDB ${db_name} init.d clean backup"
        return 1
    fi
}

# Function to create MariaDB init.d script
create_maria_initd_script() {
    local backup_type=$1
    local backup_dir=$2
    local script_file="${backup_dir}/00_mariadb_init.sh"

    print_status "Creating MariaDB init.d script"

    cat > "${script_file}" << 'EOF'
#!/bin/bash
# MariaDB initialization script for Steve database
# This script will be executed when MariaDB container starts

set -e

echo "Waiting for MariaDB to be ready..."
until mysqladmin ping -hlocalhost -uroot --silent; do
    echo "MariaDB is unavailable - sleeping"
    sleep 1
done

echo "MariaDB is ready - executing initialization"

# Source the SQL files in the current directory
for sql_file in /docker-entrypoint-initdb.d/*.sql; do
    if [ -f "$sql_file" ]; then
        echo "Executing $sql_file"
        mysql -hlocalhost -uroot -pchangeme< "$sql_file"
    fi
done

echo "MariaDB initialization completed"
EOF

    chmod +x "${script_file}"
    print_success "MariaDB init.d script created: ${script_file}"
}

# Function to create a complete init.d compatible system backup
create_initd_backup() {
    local backup_type=$1

    print_status "Starting ${backup_type} init.d compatible system backup..."

    # Detect running containers
    if ! detect_containers; then
        exit 1
    fi

    # Create separate backup directories for PostgreSQL and MariaDB
    local backup_dirs
    backup_dirs=$(create_initd_backup_dirs "${backup_type}")

    # Extract directory paths from the backup_dirs output
    local pg_backup_dir=$(echo "$backup_dirs" | cut -d'|' -f1)

    # Clean existing files in backup directories safely
    safe_clean_directory "${pg_backup_dir}" "PostgreSQL backup directory"

    # Backup PostgreSQL globals (always needed)
    if ! backup_postgres_initd_globals "${pg_backup_dir}"; then
        exit 1
    fi

    # Backup PostgreSQL databases based on type
    if [ "$backup_type" = "dirty" ]; then
        local maria_backup_dir=$(echo "$backup_dirs" | cut -d'|' -f2)
        local odoo_backup_dir=$(echo "$backup_dirs" | cut -d'|' -f3)

        safe_clean_directory "${maria_backup_dir}" "MariaDB backup directory"
        safe_clean_directory "${odoo_backup_dir}" "Odoo backup directory"

        # Backup with data
        backup_postgres_initd_dirty "${STROHM_DB}" "${pg_backup_dir}"
        backup_maria_initd_dirty "${STEVE_DB}" "${maria_backup_dir}"
        backup_postgres_initd_dirty "${ODOO_DB}" "${pg_backup_dir}"

        backup_odoo_initd_dirty "${odoo_backup_dir}"

        create_maria_initd_script "${backup_type}" "${maria_backup_dir}"

        create_postgres_manifest "${backup_type}" "${pg_backup_dir}"
        create_mariadb_manifest "${backup_type}" "${maria_backup_dir}"

        print_success "PostgreSQL backup location: ${pg_backup_dir}"
        print_success "MariaDB backup location: ${maria_backup_dir}"
        print_success "Odoo backup location: ${odoo_backup_dir}"
    elif [ "$backup_type" = "clean" ]; then
     # Backup schema only (ONLY PostgreSQL strohm, skip odoo and MariaDB)
     backup_postgres_initd_clean "${STROHM_DB}" "${pg_backup_dir}"

     odoo_createdb_sql_file "${pg_backup_dir}"

     create_postgres_manifest "${backup_type}" "${pg_backup_dir}"

     print_success "PostgreSQL backup location: ${pg_backup_dir}"
    fi


    create_main_manifest "${backup_type}" "${INITD_DIR}"

    print_success "Usage instructions: ${INITD_DIR}/README.md"
    print_success "Init.d compatible system backup completed successfully!"

}

# Function to create PostgreSQL manifest
create_postgres_manifest() {
    local backup_type=$1
    local backup_dir=$2
    local manifest_file="${backup_dir}/README.md"

    cat > "${manifest_file}" << EOF
# PostgreSQL Init.d Compatible Backup - ${backup_type}

This PostgreSQL backup is compatible with Docker Compose init.d directories.

## Backup Details
- **Type**: ${backup_type}
- **Database System**: PostgreSQL
- **Created**: $(date)
- **Host**: $(hostname)
- **Container**: ${PG_CONTAINER}

## Files Included
$(ls -la "${backup_dir}" | grep -v "^total" | awk 'NR>1 {print "- " $9 ": " $5 " bytes"}')

## File Execution Order
PostgreSQL executes files in alphabetical order:
1. \`00_postgres_globals.sql\` - Roles and global objects
2. \`strohm_*.sql\` - Strohm database
3. \`01_odoo_createdb.sql\` - Odoo database creation script (if included)

## Notes
- Files are prefixed with numbers to control execution order
- All SQL files include CREATE DATABASE statements
- Globals are restored first to ensure proper permissions
EOF

    print_success "PostgreSQL manifest created: ${manifest_file}"
}

# Function to create MariaDB manifest
create_mariadb_manifest() {
    local backup_type=$1
    local backup_dir=$2
    local manifest_file="${backup_dir}/README.md"

    cat > "${manifest_file}" << EOF
# MariaDB Init.d Compatible Backup - ${backup_type}

This MariaDB backup is compatible with Docker Compose init.d directories.

## Backup Details
- **Type**: ${backup_type}
- **Database System**: MariaDB
- **Created**: $(date)
- **Host**: $(hostname)
- **Container**: ${MARIA_CONTAINER}

## Files Included
$(ls -la "${backup_dir}" | grep -v "^total" | awk 'NR>1 {print "- " $9 ": " $5 " bytes"}')

## Usage with Docker Compose

Mount this directory to your MariaDB container's init.d directory:

\`\`\`yaml
services:
  steve-db:
    image: mariadb:10.4.30
    volumes:
      - ${backup_dir}:/docker-entrypoint-initdb.d:ro
      - mariadb_data:/var/lib/mysql
    environment:
      MYSQL_RANDOM_ROOT_PASSWORD: "yes"
      MYSQL_DATABASE: stevedb
      MYSQL_USER: steve
      MYSQL_PASSWORD: changeme
\`\`\`

## File Execution Order
MariaDB executes files in alphabetical order:
1. \`00_mariadb_init.sh\` - Initialization script
2. \`stevedb_*.sql\` - Steve database backup

## Notes
- The init script handles database creation and user setup
- SQL files contain the actual database schema and data
- MariaDB automatically sources all files in the init.d directory
EOF

    print_success "MariaDB manifest created: ${manifest_file}"
}

# Function to create main manifest
create_main_manifest() {
    local backup_type=$1
    local backup_dir=$2
    local manifest_file="${backup_dir}/README.md"

    if [ "$backup_type" == "dirty" ]; then
    cat > "${manifest_file}" << EOF
# Strohm System Init.d Compatible Backup - ${backup_type}

This backup contains both PostgreSQL, MariaDB, and Odoo backups separated into their respective compatible directories.

## Backup Details
- **Type**: ${backup_type}
- **Created**: $(date)
- **Host**: $(hostname)
- **PostgreSQL Container**: ${PG_CONTAINER}
- **MariaDB Container**: ${MARIA_CONTAINER}
- **Odoo Container**: ${ODOO_CONTAINER}

## Directory Structure
\`\`\`
${backup_dir}/
├── postgresql/${backup_type}/          # PostgreSQL init.d files
│   ├── 00_postgres_globals.sql        # PostgreSQL roles and globals
│   ├── strohm_*.sql                   # Strohm database
│   ├── odoo_*.sql                     # Odoo database (if included)
│   └── README.md                      # PostgreSQL specific instructions
├── mariadb/${backup_type}/             # MariaDB init.d files
│   ├── 00_mariadb_init.sh            # MariaDB initialization script
│   ├── stevedb_*.sql                  # Steve database
│   └── README.md                      # MariaDB specific instructions
├── odoo/${backup_type}/                # Odoo init.d files (if included)
│   ├── odoo_*.sql                     # Odoo database
│   ├── odoo_filestore/                # Odoo filestore (if included)
│   └── README.md                      # Odoo specific instructions
└── README.md                          # This file
\`\`\`

## Usage


### Use Combined Setup
Use both databases together:

\`\`\`bash
cd ${backup_dir}
docker-compose -f docker-compose.full-example.yml up
\`\`\`

## Important Notes

- **PostgreSQL init.d**: Only contains PostgreSQL-compatible files and scripts
- **MariaDB init.d**: Only contains MariaDB-compatible files and scripts
- **Separation**: This prevents PostgreSQL from trying to execute MySQL commands
- **Order**: Files are prefixed with numbers to control execution order
- **Compatibility**: Each directory can be mounted directly to the respective container's /docker-entrypoint-initdb.d

## Environment Variables for Restoration

When using these backups, ensure your Docker Compose environment variables match the original setup:

- PostgreSQL: POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
- MariaDB: MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE

For more detailed instructions, see the README.md files in each subdirectory.
EOF

    elif [ "$backup_type" == "clean" ]; then
    cat > "${manifest_file}" << EOF
# Strohm System Init.d Compatible Backup - ${backup_type}

This backup contains both PostgreSQL and MariaDB backups separated into their respective init.d compatible directories.

## Backup Details
- **Type**: ${backup_type}
- **Created**: $(date)
- **Host**: $(hostname)
- **PostgreSQL Container**: ${PG_CONTAINER}

## Directory Structure
\`\`\`
${backup_dir}/
├── postgresql/${backup_type}/          # PostgreSQL init.d files
│   ├── 00_postgres_globals.sql        # PostgreSQL roles and globals
│   ├── strohm_*.sql                   # Strohm database
│   ├── 01_odoo_createdb.sql        # Odoo database creation script
│   └── README.md                      # PostgreSQL specific instructions
└── README.md                          # This file
\`\`\`

## Usage


### Use Combined Setup
Use both databases together:

\`\`\`bash
cd ${backup_dir}
docker-compose -f docker-compose.full-example.yml up
\`\`\`

## Important Notes

- **PostgreSQL init.d**: Only contains PostgreSQL-compatible files and scripts
- **MariaDB init.d**: Only contains MariaDB-compatible files and scripts
- **Separation**: This prevents PostgreSQL from trying to execute MySQL commands
- **Order**: Files are prefixed with numbers to control execution order
- **Compatibility**: Each directory can be mounted directly to the respective container's /docker-entrypoint-initdb.d

## Environment Variables for Restoration

When using these backups, ensure your Docker Compose environment variables match the original setup:

- PostgreSQL: POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
- MariaDB: MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE

For more detailed instructions, see the README.md files in each subdirectory.
EOF
    else
        print_error "Invalid backup type: ${backup_type}. Use 'dirty' or 'clean'."
        exit 1
fi
    print_success "Main manifest created: ${manifest_file}"
}

# Function to list available backups
list_backups() {
    print_status "Available backups:"
    if [ -d "${BACKUP_DIR}" ]; then
        ls -la "${BACKUP_DIR}"
    else
        print_warning "No backups found. Backup directory does not exist."
    fi
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS] COMMAND"
    echo ""
    echo "Commands:"
    echo "  dirty       Create a dirty backup (with all data)"
    echo "  clean       Create a clean backup (schema only)"
    echo "  initd-dirty Create a dirty backup compatible with Docker Compose init.d"
    echo "  initd-clean Create a clean backup compatible with Docker Compose init.d"
    echo "  list        List available backups"
    echo "  config      Show current configuration"
    echo "  help        Show this help message"
    echo ""
    echo "Configuration Options:"
    echo "  --config FILE           Use specific configuration file"
    echo "  --env ENV              Use environment-specific config (dev|prod|test)"
    echo "  --pg-host HOST         PostgreSQL host (default: localhost)"
    echo "  --pg-port PORT         PostgreSQL port (default: 5432)"
    echo "  --pg-user USER         PostgreSQL user (default: postgres)"
    echo "  --pg-password PASS     PostgreSQL password"
    echo "  --maria-host HOST      MariaDB host (default: localhost)"
    echo "  --maria-port PORT      MariaDB port (default: 3306)"
    echo "  --maria-user USER      MariaDB user (default: steve)"
    echo "  --maria-password PASS  MariaDB password"
    echo "  --backup-dir DIR       Backup directory (default: ./database/backups)"
    echo "  --initd-dir DIR        Init.d directory (default: ./database/init.d)"
    echo "  --pg-container NAME    PostgreSQL container name (auto-detected)"
    echo "  --maria-container NAME MariaDB container name (auto-detected)"
    echo ""
    echo "Configuration Priority (highest to lowest):"
    echo "  1. Command line arguments"
    echo "  2. Environment variables"
    echo "  3. Configuration file"
    echo "  4. Default values"
    echo ""
    echo "Examples:"
    echo "  $0 dirty                                    # Use default configuration"
    echo "  $0 --env dev initd-dirty                    # Use dev environment config"
    echo "  $0 --config custom.env clean               # Use custom config file"
    echo "  $0 --pg-password secret123 dirty           # Override password"
    echo "  PG_PASSWORD=secret123 $0 dirty              # Set via environment"
    echo "  $0 config                                   # Show current configuration"
    echo ""
    echo "Configuration Files:"
    echo "  ./backup_config.env                        # Default configuration"
    echo "  ./backup_config_\$ENV.env                  # Environment-specific"
    echo "  ./.env                                     # Standard .env file"
    echo ""
    echo "Environment Variables:"
    echo "  All configuration options can be set via environment variables"
    echo "  Example: PG_HOST=db.example.com PG_PORT=5433 $0 dirty"
}

# Main script logic
main() {
    local args=("$@")
    local backup_command=""

    # Parse arguments first to extract command and options
    while [[ $# -gt 0 ]]; do
        case $1 in
            dirty|clean|initd-dirty|initd-clean|list|config|help|-h|--help)
                backup_command="$1"
                shift
                break
                ;;
            *)
                shift
                ;;
        esac
    done

    # Load configuration
    load_config

    # Set configuration variables
    set_config_variables

    # Parse all arguments for configuration options
    parse_arguments "${args[@]}"

    # Validate configuration for backup commands
    if [[ "$backup_command" =~ ^(dirty|clean|initd-dirty|initd-clean)$ ]]; then
        if ! validate_config; then
            exit 1
        fi

        if [ "$backup_command" = "initd-clean" ] || [ "$backup_command" = "clean" ]; then
            BASE_BACKUP_TYPE="clean"

            # Auto-detect containers if not specified
            if [ -z "$PG_CONTAINER" ]; then
                if ! detect_containers; then
                    print_error "Failed to detect required containers"
                    exit 1
                fi
            fi

        elif [ "$backup_command" = "initd-dirty" ] || [ "$backup_command" = "dirty" ]; then
            BASE_BACKUP_TYPE="dirty"
            # Auto-detect containers if not specified
            if [ -z "$PG_CONTAINER" ] || [ -z "$MARIA_CONTAINER" ] || [ -z "$ODOO_CONTAINER" ]; then
                if ! detect_containers; then
                    print_error "Failed to detect required containers"
                    exit 1
                fi
            fi
        fi

        # Show current configuration
        show_config
    fi

    case "$backup_command" in
        "dirty")
            create_system_backup "dirty"
            ;;
        "clean")
            create_system_backup "clean"
            ;;
        "initd-dirty")
            create_initd_backup "dirty"
            ;;
        "initd-clean")
            create_initd_backup "clean"
            ;;
        "list")
            list_backups
            ;;
        "config")
            show_config
            ;;
        "help"|"-h"|"--help")
            show_usage
            ;;
        *)
            print_error "Invalid command or no command provided"
            show_usage
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
