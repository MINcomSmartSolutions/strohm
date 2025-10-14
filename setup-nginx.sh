#!/bin/bash

# Nginx setup script for Strohm production
# This script configures nginx on the host system for Strohm

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Strohm Nginx Setup Script${NC}"
echo "==============================="

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Error: This script must be run as root (use sudo)${NC}"
   exit 1
fi

# Check if nginx is installed
if ! command -v nginx >/dev/null 2>&1; then
    echo -e "${YELLOW}Installing nginx...${NC}"
    apt update
    apt install -y nginx
else
    echo -e "${GREEN}Nginx is already installed${NC}"
fi

# Check if certbot is installed
if ! command -v certbot >/dev/null 2>&1; then
    echo -e "${YELLOW}Installing certbot...${NC}"
    apt install -y certbot python3-certbot-nginx
else
    echo -e "${GREEN}Certbot is already installed${NC}"
fi

# Copy nginx configuration
echo -e "${BLUE}Setting up nginx configuration...${NC}"
if [ -f "nginx.host.conf" ]; then
    cp nginx.host.conf /etc/nginx/sites-available/strohm
    echo -e "${GREEN}Configuration copied to /etc/nginx/sites-available/strohm${NC}"
else
    echo -e "${RED}Error: nginx.host.conf not found in current directory${NC}"
    exit 1
fi

# Create symlink if it doesn't exist
if [ ! -L "/etc/nginx/sites-enabled/strohm" ]; then
    ln -s /etc/nginx/sites-available/strohm /etc/nginx/sites-enabled/
    echo -e "${GREEN}Site enabled${NC}"
else
    echo -e "${YELLOW}Site already enabled${NC}"
fi

# Remove default nginx site if it exists
if [ -L "/etc/nginx/sites-enabled/default" ]; then
    echo -e "${YELLOW}Removing default nginx site...${NC}"
    rm /etc/nginx/sites-enabled/default
fi

# Test nginx configuration
echo -e "${BLUE} Testing nginx configuration...${NC}"
if nginx -t; then
    echo -e "${GREEN}Nginx configuration is valid${NC}"
else
    echo -e "${RED}Nginx configuration has errors${NC}"
    exit 1
fi

# Create log directories if they don't exist
mkdir -p /var/log/nginx

echo -e "${BLUE}SSL Certificate Setup${NC}"
echo "Before starting nginx, you need SSL certificates."
echo ""
echo -e "${YELLOW}Option 1: Get Let's Encrypt certificates (recommended):${NC}"
echo "sudo certbot certonly --standalone -d backend.laden.hm.edu -d laden.hm.edu"
echo ""
echo -e "${YELLOW}Option 2: Use existing certificates:${NC}"
echo "Make sure certificates are available at:"
echo "  - /etc/letsencrypt/live/backend.laden.hm.edu/"
echo "  - /etc/letsencrypt/live/laden.hm.edu/"
echo ""

read -p "Do you want to get Let's Encrypt certificates now? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}Getting SSL certificates...${NC}"
    
    # Stop nginx if it's running to free up port 80
    systemctl stop nginx 2>/dev/null || true
    
    # Get certificates
    certbot certonly --standalone -d backend.laden.hm.edu -d laden.hm.edu
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}SSL certificates obtained successfully${NC}"
    else
        echo -e "${RED}Failed to obtain SSL certificates${NC}"
        echo "Please obtain certificates manually before starting nginx."
        exit 1
    fi
fi

# Start and enable nginx
echo -e "${BLUE} Starting nginx...${NC}"
systemctl enable nginx
systemctl start nginx

if systemctl is-active --quiet nginx; then
    echo -e "${GREEN}Nginx is running successfully${NC}"
else
    echo -e "${RED}Failed to start nginx${NC}"
    systemctl status nginx
    exit 1
fi

# Set up automatic certificate renewal
echo -e "${BLUE}Setting up automatic certificate renewal...${NC}"
if ! crontab -l 2>/dev/null | grep -q "certbot renew"; then
    (crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet --reload-nginx") | crontab -
    echo -e "${GREEN}Automatic certificate renewal configured${NC}"
else
    echo -e "${YELLOW}Certificate renewal already configured${NC}"
fi

echo ""
echo -e "${GREEN}Nginx setup completed successfully!${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Start your Docker containers: ./production_action.sh deploy"
echo "2. Test your endpoints:"
echo "   - https://backend.laden.hm.edu/health"
echo "   - https://laden.hm.edu/web/health"
echo "3. Monitor logs: sudo tail -f /var/log/nginx/error.log"