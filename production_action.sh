#!/bin/bash

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="prod-docker-compose.yml"
ENV_FILE=".env.prod"
BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"

echo -e "${GREEN}Ladeabrechnung Production Deployment${NC}"
echo "=================================="

# Check if running as root (not recommended for production)
if [[ $EUID -eq 0 ]]; then
   echo -e "${YELLOW}Warning: Running as root is not recommended for production deployments${NC}"
   read -p "Do you want to continue? (y/N): " -n 1 -r
   echo
   if [[ ! $REPLY =~ ^[Yy]$ ]]; then
       exit 1
   fi
fi

# Check if environment file exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}Error: $ENV_FILE not found!${NC}"
    echo -e "${YELLOW}Please copy .env.prod.template to $ENV_FILE and configure it with production values.${NC}"
    exit 1
fi

# Check if required database files exist
if [ ! -f "./backend/database/db-structure-strohm.sql" ]; then
    echo -e "${RED}Error: ./backend/database/db-structure-strohm.sql not found!${NC}"
    exit 1
fi

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check required tools
echo -e "${BLUE}Checking required tools...${NC}"

# Check docker binary
if ! command_exists docker; then
    echo -e "${RED} Error: docker is not installed${NC}"
    exit 1
fi

# Check docker compose availability (supports both 'docker compose' and 'docker-compose')
if ! docker compose version >/dev/null 2>&1 && ! command_exists docker-compose; then
    echo -e "${RED} Error: docker compose is not available (neither 'docker compose' nor 'docker-compose')${NC}"
    exit 1
fi

# Check git
if ! command_exists git; then
    echo -e "${RED} Error: git is not installed${NC}"
    exit 1
fi

echo -e "${GREEN} All required tools are available${NC}"
# Check Docker daemon
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED} Error: Docker daemon is not running${NC}"
    exit 1
fi

# Load environment variables
set -a
source "$ENV_FILE"
set +a

# Validate required environment variables
required_vars=(
    "POSTGRES_USER"
    "POSTGRES_PASSWORD"
    "STROHM_DB"
    "STROHM_DB_USER"
    "STROHM_DB_PASSWORD"
    "ODOO_DB"
    "ODOO_DB_USER"
    "ODOO_DB_PASSWORD"
)

for var in "${required_vars[@]}"; do
    if [ -z "${!var:-}" ]; then
        echo -e "${RED}Error: Required environment variable $var is not set${NC}"
        exit 1
    fi
done

# Function to check if system is already deployed
is_fresh_deployment() {
    # Check if database container is running
    if ! docker compose -f "$COMPOSE_FILE" ps db 2>/dev/null | grep -q "Up"; then
        return 0  # Fresh deployment - no running database
    fi

    # Check if strohm database exists (connect to postgres database to list databases)
    if ! docker compose -f "$COMPOSE_FILE" exec -T db psql -U "$POSTGRES_USER" -d postgres -lqt | cut -d \| -f 1 | grep -qw "$STROHM_DB"; then
        return 0  # Fresh deployment - strohm database doesn't exist
    fi

    # Check if odoo database exists (connect to postgres database to list databases)
    if ! docker compose -f "$COMPOSE_FILE" exec -T db psql -U "$POSTGRES_USER" -d postgres -lqt | cut -d \| -f 1 | grep -qw "$ODOO_DB"; then
        return 0  # Fresh deployment - odoo database doesn't exist
    fi

    return 1  # Existing deployment
}

# Function to wait for database to be ready
wait_for_database() {
    echo "Waiting for database to be ready..."
    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if docker compose -f "$COMPOSE_FILE" exec -T db pg_isready -U "$POSTGRES_USER" >/dev/null 2>&1; then
            echo -e "${GREEN}Database is ready${NC}"
            return 0
        fi
        echo "Attempt $attempt/$max_attempts: Database not ready yet..."
        sleep 2
        ((attempt++))
    done

    echo -e "${RED}Error: Database did not become ready in time${NC}"
    return 1
}

# Function to wait for service health
wait_for_service_health() {
    local service=$1
    local max_attempts=30
    local attempt=1

    echo "Waiting for $service to be healthy..."

    while [ $attempt -le $max_attempts ]; do
        local health_status=$(docker compose -f "$COMPOSE_FILE" ps "$service" --format json 2>/dev/null | grep -o '"Health":"[^"]*"' | cut -d'"' -f4 || echo "")

        if [ "$health_status" = "healthy" ] || docker compose -f "$COMPOSE_FILE" ps "$service" 2>/dev/null | grep -q "Up"; then
            echo -e "${GREEN}$service is healthy${NC}"
            return 0
        fi

        echo "Attempt $attempt/$max_attempts: $service not healthy yet (status: ${health_status:-unknown})..."
        sleep 2
        ((attempt++))
    done

    echo -e "${YELLOW}Warning: $service did not report healthy status in time${NC}"
    return 1
}

# Function to initialize fresh deployment
initialize_fresh_deployment() {
    echo -e "${BLUE}Initializing fresh deployment...${NC}"

    # Wait for database to be ready with proper health check
    if ! wait_for_database; then
        echo -e "${RED}Failed to initialize: database not ready${NC}"
        return 1
    fi

    # Create databases and users using environment variables
    echo "Creating databases and users..."

    # Create strohm user first using PGPASSWORD to avoid password in process list
    echo "Creating Strohm user..."
    if ! PGPASSWORD="$POSTGRES_PASSWORD" docker compose -f "$COMPOSE_FILE" exec -T -e PGPASSWORD db psql -U "$POSTGRES_USER" -d postgres <<-EOSQL
		DO \$\$
		BEGIN
		    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$STROHM_DB_USER') THEN
		        CREATE ROLE "$STROHM_DB_USER";
		        ALTER ROLE "$STROHM_DB_USER" WITH SUPERUSER INHERIT NOCREATEROLE CREATEDB LOGIN NOREPLICATION NOBYPASSRLS PASSWORD '$STROHM_DB_PASSWORD';
		    END IF;
		END
		\$\$;
	EOSQL
    then
        echo -e "${RED}Failed to create Strohm user${NC}"
        return 1
    fi

    # Apply database structure for strohm
    echo "Applying Strohm database structure..."
    if ! PGPASSWORD="$POSTGRES_PASSWORD" docker compose -f "$COMPOSE_FILE" exec -T -e PGPASSWORD db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < ./backend/database/db-structure-strohm.sql; then
        echo -e "${RED}Failed to apply database structure${NC}"
        return 1
    fi

    # Grant privileges to strohm user
    PGPASSWORD="$POSTGRES_PASSWORD" docker compose -f "$COMPOSE_FILE" exec -T -e PGPASSWORD db psql -U "$POSTGRES_USER" -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE \"$STROHM_DB\" TO \"$STROHM_DB_USER\";" || true

    # Create Odoo user
    echo "Creating Odoo user..."
    if ! PGPASSWORD="$POSTGRES_PASSWORD" docker compose -f "$COMPOSE_FILE" exec -T -e PGPASSWORD db psql -U "$POSTGRES_USER" -d postgres <<-EOSQL
		DO \$\$
		BEGIN
		    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$ODOO_DB_USER') THEN
            CREATE ROLE "$ODOO_DB_USER";
            ALTER ROLE "$ODOO_DB_USER" WITH SUPERUSER INHERIT CREATEROLE CREATEDB LOGIN NOREPLICATION NOBYPASSRLS PASSWORD '$ODOO_DB_PASSWORD';
		    END IF;
		END
		\$\$;
	EOSQL
    then
        echo -e "${RED}Failed to create Odoo user${NC}"
        return 1
    fi


    echo "Granting schema permissions..."
    PGPASSWORD="$POSTGRES_PASSWORD" docker compose -f "$COMPOSE_FILE" exec -T -e PGPASSWORD db psql -U "$POSTGRES_USER" -d "$STROHM_DB" <<-EOSQL
		GRANT ALL ON SCHEMA public TO "$STROHM_DB_USER";
		GRANT ALL ON ALL TABLES IN SCHEMA public TO "$STROHM_DB_USER";
		GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO "$STROHM_DB_USER";
		ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "$STROHM_DB_USER";
		ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "$STROHM_DB_USER";
	EOSQL

    # Wait for Odoo service to be ready
    wait_for_service_health "odoo"

    # Initialize Odoo database
    echo "Initializing Odoo database..."
    if ! docker compose -f "$COMPOSE_FILE" exec odoo odoo -d "$ODOO_DB" -i base --stop-after-init --without-demo=all --load-language=de_DE; then
        echo -e "${RED}Failed to initialize Odoo database${NC}"
        return 1
    fi

    echo "Setting ownership and permissions for Odoo database..."
    PGPASSWORD="$ODOO_DB_PASSWORD" docker compose -f "$COMPOSE_FILE" exec -T -e PGPASSWORD db psql -U "$ODOO_DB_USER" -d "$ODOO_DB" <<-EOSQL
    ALTER DATABASE "$ODOO_DB" OWNER TO "$ODOO_DB_USER";
    GRANT ALL ON SCHEMA public TO "$ODOO_DB_USER";
    GRANT ALL ON ALL TABLES IN SCHEMA public TO "$ODOO_DB_USER";
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO "$ODOO_DB_USER";
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "$ODOO_DB_USER";
	EOSQL

    echo -e "${GREEN}Fresh deployment initialization completed${NC}"
}

# Function to handle updates
handle_odoo_update_deployment() {
    echo -e "${BLUE}Handling update deployment...${NC}"

    # Update Odoo modules if needed
#    echo "Updating Odoo modules..."
#    docker compose -f "$COMPOSE_FILE" run --rm odoo odoo -d "$ODOO_DB" -u all --stop-after-init
#FIXME: Might brake the system
    echo -e "${GREEN}Update deployment completed${NC}"
}

# Function to create backup
create_backup() {
    echo -e "${BLUE}Creating backup...${NC}"
    mkdir -p "$BACKUP_DIR"
    
    local backup_failed=0

    # Backup database
    if docker compose -f "$COMPOSE_FILE" ps db | grep -q "Up"; then
        echo "Backing up PostgreSQL databases..."

        if ! docker compose -f "$COMPOSE_FILE" exec -T db pg_dump -U "$POSTGRES_USER" postgres > "$BACKUP_DIR/postgres_backup.sql"; then
            echo -e "${RED}Failed to backup postgres database${NC}"
            backup_failed=1
        fi

        if ! PGPASSWORD="$STROHM_DB_PASSWORD" docker compose -f "$COMPOSE_FILE" exec -T -e PGPASSWORD db pg_dump -U "$STROHM_DB_USER" "$STROHM_DB" > "$BACKUP_DIR/strohm_backup.sql"; then
            echo -e "${RED}Failed to backup strohm database${NC}"
            backup_failed=1
        fi

        if ! PGPASSWORD="$ODOO_DB_PASSWORD" docker compose -f "$COMPOSE_FILE" exec -T -e PGPASSWORD db pg_dump -U "$ODOO_DB_USER" "$ODOO_DB" > "$BACKUP_DIR/odoo_backup.sql"; then
            echo -e "${RED}Failed to backup odoo database${NC}"
            backup_failed=1
        fi

        # Verify backup files are not empty
        for backup_file in "$BACKUP_DIR"/*.sql; do
            if [ ! -s "$backup_file" ]; then
                echo -e "${RED}Warning: Backup file $backup_file is empty${NC}"
                backup_failed=1
            fi
        done
    else
        echo -e "${YELLOW}Database container is not running, skipping database backup${NC}"
    fi
    
    echo "Backing up Docker volumes..."
    if docker volume inspect odoo-prod-web-data >/dev/null 2>&1; then
        if ! docker run --rm -v odoo-prod-web-data:/data -v "$PWD/$BACKUP_DIR":/backup alpine tar czf /backup/odoo-web-data.tar.gz -C /data .; then
            echo -e "${RED}Failed to backup odoo volume${NC}"
            backup_failed=1
        fi
    else
        echo -e "${YELLOW}Volume odoo-prod-web-data does not exist, skipping volume backup${NC}"
    fi

    if [ $backup_failed -eq 0 ]; then
        echo -e "${GREEN}Backup created successfully in $BACKUP_DIR${NC}"
        return 0
    else
        echo -e "${YELLOW}Backup completed with warnings in $BACKUP_DIR${NC}"
        return 1
    fi
}

# Function to deploy
deploy() {
    echo -e "${BLUE}Starting deployment...${NC}"

    # Check if this is a fresh deployment or update
    if is_fresh_deployment; then
        echo -e "${YELLOW}Fresh deployment detected${NC}"

        # Pull latest images
        echo "Pulling latest images..."
        docker compose -f "$COMPOSE_FILE" pull

        # Start services
        echo "Starting services..."
        docker compose -f "$COMPOSE_FILE" up -d --build

        # Initialize fresh deployment
        if ! initialize_fresh_deployment; then
            echo -e "${RED}Fresh deployment initialization failed${NC}"
            return 1
        fi

    else
        echo -e "${YELLOW}Existing deployment detected - performing update${NC}"

        if ! create_backup; then
            echo -e "${RED}Backup failed! Aborting update.${NC}"
            echo -e "${YELLOW}Fix backup issues before proceeding with update.${NC}"
            return 1
        fi

        # Pull latest images
        echo "Pulling latest images..."
        docker compose -f "$COMPOSE_FILE" pull

        # Stop existing containers
        echo "Stopping existing containers..."
        docker compose -f "$COMPOSE_FILE" down

        # Start services
        echo "Starting services..."
        docker compose -f "$COMPOSE_FILE" up -d

        # Wait for services to be healthy
        wait_for_database
        wait_for_service_health "server"
        wait_for_service_health "odoo"

        # Handle update deployment
        if ! handle_odoo_update_deployment; then
            echo -e "${RED}Update deployment failed${NC}"
            echo -e "${YELLOW}Backup is available at: $BACKUP_DIR${NC}"
            return 1
        fi
    fi

    # Check service health
    check_health
}

# Function to check service health
check_health() {
    echo -e "${BLUE}Checking service health...${NC}"
    
    services=("db" "server" "odoo")
    
    for service in "${services[@]}"; do
        echo -n "Checking $service... "
        if docker compose -f "$COMPOSE_FILE" ps "$service" | grep -q "Up"; then
            echo -e "${GREEN} Running${NC}"
        else
            echo -e "${RED} Not running${NC}"
            docker compose -f "$COMPOSE_FILE" logs --tail=20 "$service"
        fi
    done
}

# Function to show logs
show_logs() {
    echo -e "${BLUE} Recent logs:${NC}"
    docker compose -f "$COMPOSE_FILE" logs --tail=75
}

# Function to cleanup old images
cleanup() {
    echo -e "${BLUE}Cleaning up old Docker images...${NC}"
    docker image prune -f
    docker volume prune -f
    echo -e "${GREEN} Cleanup completed${NC}"
}

# Main menu
case "${1:-deploy}" in
    "deploy")
        echo -e "${YELLOW}This will deploy production environment in this machine. Continue? (y/N)${NC}"
        read -p "> " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            deploy
            echo -e "${GREEN}Deployment completed successfully!${NC}"
        else
            echo "Deployment cancelled."
        fi
        ;;
    "backup")
        create_backup
        ;;
    "health")
        check_health
        ;;
    "logs")
        show_logs
        ;;
    "cleanup")
        cleanup
        ;;
    "stop")
        echo "Stopping all services..."
        docker compose -f "$COMPOSE_FILE" stop
        echo -e "${GREEN} All services stopped${NC}"
        ;;
    "down")
        echo "Downing all services..."
        docker compose -f "$COMPOSE_FILE" down
        echo -e "${GREEN} All services downed${NC}"
        ;;
    "restart")
        echo "Restarting all services..."
        docker compose -f "$COMPOSE_FILE" restart
        echo -e "${GREEN} All services restarted${NC}"
        ;;
    "update")
        echo -e "${YELLOW}This will update and restart services. Continue? (y/N)${NC}"
        read -p "> " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            create_backup
            docker compose -f "$COMPOSE_FILE" pull
            docker compose -f "$COMPOSE_FILE" up -d
            check_health
            echo -e "${GREEN} Update completed successfully!${NC}"
        fi
        ;;
    "delete")
        echo -e "${RED}This will DELETE the volumes and stop all services! Continue? (y/N)${NC}"
        read -p "> " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            docker compose -f "$COMPOSE_FILE" down -v
            echo -e "${GREEN} All services stopped and volumes cleaned${NC}"
        fi
        ;;
    *)
        echo "Usage: $0 {deploy|backup|health|logs|cleanup|stop|down|restart|update|delete}"
        echo ""
        echo "Commands:"
        echo "  deploy  - Full deployment with backup"
        echo "  backup  - Create backup only"
        echo "  health  - Check service health"
        echo "  logs    - Show recent logs"
        echo "  cleanup - Clean up Docker images and volumes"
        echo "  stop    - Stop all services. Stop services only."
        echo "  down    - Down all services. Stop and remove containers, networks..."
        echo "  restart - Restart all services"
        echo "  update  - Update and restart services"
        echo "  delete  - Delete the volumes and stop all services and remove containers, networks..."
        exit 1
        ;;
esac