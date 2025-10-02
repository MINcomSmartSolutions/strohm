#!/bin/bash

# Production deployment script for Strohm

set -e

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

echo -e "${BLUE}Ladeabrechnung Production Deployment Script${NC}"
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
source $ENV_FILE
set +a

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

# Function to initialize fresh deployment
initialize_fresh_deployment() {
    echo -e "${BLUE}Initializing fresh deployment...${NC}"

    # Wait for database to be ready
    echo "Waiting for database to be ready..."
    sleep 10

    # Create databases and users using environment variables
    echo "Creating databases and users..."

    # Create strohm user and database
    docker compose -f "$COMPOSE_FILE" exec -T db psql -U "$POSTGRES_USER" -c "
        CREATE USER $STROHM_DB_USER WITH PASSWORD '$STROHM_DB_PASSWORD';
        CREATE DATABASE $STROHM_DB WITH OWNER $STROHM_DB_USER ENCODING 'UTF8';
        GRANT ALL PRIVILEGES ON DATABASE $STROHM_DB TO $STROHM_DB_USER;
    "

    # Create odoo user and database
    docker compose -f "$COMPOSE_FILE" exec -T db psql -U "$POSTGRES_USER" -c "
        CREATE USER $ODOO_DB_USER WITH PASSWORD '$ODOO_DB_PRODUCTION_PASSWORD' CREATEDB;
        CREATE DATABASE $ODOO_DB WITH OWNER $ODOO_DB_USER ENCODING 'UTF8';
        GRANT ALL PRIVILEGES ON DATABASE $ODOO_DB TO $ODOO_DB_USER;
    "

    # Apply database structure for strohm (modify to use env variables)
    echo "Applying Strohm database structure..."
    # Create a temporary SQL file that uses environment variables
    cat > /tmp/strohm_init.sql << EOF
CREATE DATABASE $STROHM_DB WITH TEMPLATE = template0 ENCODING = 'UTF8' LOCALE_PROVIDER = libc LOCALE = 'en_US.utf8';
ALTER DATABASE $STROHM_DB OWNER TO $STROHM_DB_USER;
COMMENT ON DATABASE $STROHM_DB IS 'Database for stroHM project. All datetime''s are in UTC timezone';
EOF

    # Copy the structure file and modify it
    sed "s/strohm_admin/$STROHM_DB_USER/g; s/DROP DATABASE strohm;//g; s/CREATE DATABASE strohm/-- Database already created/g" \
        ./database/db-structure-strohm.sql > /tmp/strohm_structure_modified.sql

    # Apply the modified structure
    docker compose -f "$COMPOSE_FILE" exec -T db psql -U "$STROHM_DB_USER" -d "$STROHM_DB" -f - < /tmp/strohm_structure_modified.sql

    # Initialize Odoo database
    echo "Initializing Odoo database..."
    docker compose -f "$COMPOSE_FILE" exec odoo odoo -d "$ODOO_DB" -i base --stop-after-init --without-demo=all

    # Clean up temporary files
    rm -f /tmp/strohm_init.sql /tmp/strohm_structure_modified.sql

    echo -e "${GREEN}Fresh deployment initialization completed${NC}"
}

# Function to handle updates
handle_update_deployment() {
    echo -e "${BLUE}Handling update deployment...${NC}"

    # Update Odoo modules if needed
    echo "Updating Odoo modules..."
    docker compose -f "$COMPOSE_FILE" exec odoo odoo -d "$ODOO_DB" -u all --stop-after-init

    echo -e "${GREEN}Update deployment completed${NC}"
}

# Function to create backup
create_backup() {
    echo -e "${BLUE}Creating backup...${NC}"
    mkdir -p "$BACKUP_DIR"
    
    # Backup database
    if docker compose -f "$COMPOSE_FILE" ps db | grep -q "Up"; then
        echo "Backing up PostgreSQL database..."
        docker compose -f "$COMPOSE_FILE" exec -T db pg_dump -U "$POSTGRES_USER" postgres > "$BACKUP_DIR/postgres_backup.sql"
        docker compose -f "$COMPOSE_FILE" exec -T db pg_dump -U "$STROHM_DB_USER" "$STROHM_DB" > "$BACKUP_DIR/strohm_backup.sql"
        docker compose -f "$COMPOSE_FILE" exec -T db pg_dump -U "$ODOO_DB_USER" "$ODOO_DB" > "$BACKUP_DIR/odoo_backup.sql"
    fi
    
    # Backup volumes
    echo "Backing up Docker volumes..."
    docker run --rm -v strohm_odoo-web-data:/data -v "$PWD"/"$BACKUP_DIR":/backup alpine tar czf /backup/odoo-web-data.tar.gz -C /data .
    
    echo -e "${GREEN} Backup created in $BACKUP_DIR${NC}"
}

# Function to deploy
deploy() {
    echo -e "${BLUE} Starting deployment...${NC}"
    
    # Check if this is a fresh deployment or update
    if is_fresh_deployment; then
        echo -e "${YELLOW}Fresh deployment detected${NC}"

        # Pull latest images
        echo "Pulling latest images..."
        docker compose -f "$COMPOSE_FILE" pull

        # Start services
        echo "Starting services..."
        docker compose -f "$COMPOSE_FILE" up -d

        # Wait for database to be ready
        echo "Waiting for database service to be ready..."
        sleep 30

        # Initialize fresh deployment
        initialize_fresh_deployment

    else
        echo -e "${YELLOW}Existing deployment detected - performing update${NC}"

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
        echo "Waiting for services to start..."
        sleep 30

        # Handle update deployment
        handle_update_deployment
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
    docker compose -f "$COMPOSE_FILE" logs --tail=50
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
        echo -e "${YELLOW}This will deploy to production. Continue? (y/N)${NC}"
        read -p "> " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            create_backup
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
    "down")
        echo "Stopping all services..."
        docker compose -f "$COMPOSE_FILE" down
        echo -e "${GREEN} All services stopped${NC}"
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
    *)
        echo "Usage: $0 {deploy|backup|health|logs|cleanup|down|restart|update}"
        echo ""
        echo "Commands:"
        echo "  deploy  - Full deployment with backup"
        echo "  backup  - Create backup only"
        echo "  health  - Check service health"
        echo "  logs    - Show recent logs"
        echo "  cleanup - Clean up Docker images and volumes"
        echo "  down    - Down all services"
        echo "  restart - Restart all services"
        echo "  update  - Update and restart services"
        exit 1
        ;;
esac