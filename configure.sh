#!/bin/bash

# Quick Configuration Script for Dialpad Logs
# This script helps configure the application for external access

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Dialpad Logs Configuration${NC}"
echo -e "${BLUE}================================${NC}\n"

# Check if .env already exists
if [ -f .env ]; then
    echo -e "${YELLOW}⚠️  .env file already exists${NC}"
    read -p "Do you want to overwrite it? (yes/no): " overwrite
    if [ "$overwrite" != "yes" ]; then
        echo -e "${RED}Configuration cancelled${NC}"
        exit 0
    fi
fi

# Get server IP automatically
echo -e "\n${BLUE}Detecting server IP...${NC}"
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

if [ -z "$SERVER_IP" ]; then
    echo -e "${YELLOW}⚠️  Could not auto-detect IP${NC}"
    read -p "Enter your server IP address: " SERVER_IP
else
    echo -e "${GREEN}✅ Detected IP: $SERVER_IP${NC}"
    read -p "Use this IP? (yes/no): " use_detected
    if [ "$use_detected" != "yes" ]; then
        read -p "Enter your server IP or domain: " SERVER_IP
    fi
fi

# Get Dialpad token
echo -e "\n${BLUE}Dialpad Configuration${NC}"
read -p "Enter your Dialpad API Token: " DIALPAD_TOKEN

if [ -z "$DIALPAD_TOKEN" ]; then
    echo -e "${YELLOW}⚠️  No token provided, using placeholder${NC}"
    DIALPAD_TOKEN="your_dialpad_api_token"
fi

# Ask about webhook secret
echo -e "\n${BLUE}Webhook Configuration${NC}"
read -p "Enter webhook secret (press Enter for default 'dp_call_logs'): " WEBHOOK_SECRET
WEBHOOK_SECRET=${WEBHOOK_SECRET:-dp_call_logs}

# Ask about environment
echo -e "\n${BLUE}Environment Configuration${NC}"
read -p "Environment (development/production) [development]: " NODE_ENV
NODE_ENV=${NODE_ENV:-development}

# Determine protocol
if [ "$NODE_ENV" == "production" ]; then
    read -p "Use HTTPS? (yes/no) [yes]: " use_https
    use_https=${use_https:-yes}
    if [ "$use_https" == "yes" ]; then
        PROTOCOL="https"
    else
        PROTOCOL="http"
    fi
else
    PROTOCOL="http"
fi

# Generate .env file
echo -e "\n${BLUE}Generating .env file...${NC}"

cat > .env << EOF
# Database Configuration
DB_HOST=postgres
DB_PORT=5432
DB_USER=dp_calls
DB_PASSWORD=dp_logs
DB_NAME=dialpad_calls_db

# Dialpad API Configuration
DIALPAD_TOKEN=$DIALPAD_TOKEN

# Webhook Configuration
WEBHOOK_SECRET=$WEBHOOK_SECRET

# Server Configuration
PORT=3001
NODE_ENV=$NODE_ENV

# CORS Configuration
CORS_ORIGINS=${PROTOCOL}://localhost:3000,${PROTOCOL}://${SERVER_IP}:3000,${PROTOCOL}://${SERVER_IP}:3001

# Frontend API URL
REACT_APP_API_URL=${PROTOCOL}://${SERVER_IP}:3001/api

# Frontend WebSocket URL
REACT_APP_WS_URL=${PROTOCOL}://${SERVER_IP}:3001

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
EOF

echo -e "${GREEN}✅ .env file created successfully!${NC}"

# Display configuration
echo -e "\n${BLUE}Configuration Summary:${NC}"
echo -e "  Server IP/Domain: ${YELLOW}${SERVER_IP}${NC}"
echo -e "  Protocol: ${YELLOW}${PROTOCOL}${NC}"
echo -e "  Environment: ${YELLOW}${NODE_ENV}${NC}"
echo -e "  Frontend URL: ${YELLOW}${PROTOCOL}://${SERVER_IP}:3000${NC}"
echo -e "  Backend API URL: ${YELLOW}${PROTOCOL}://${SERVER_IP}:3001${NC}"
echo -e "  WebSocket URL: ${YELLOW}${PROTOCOL}://${SERVER_IP}:3001${NC}"
echo -e "  Webhook URL: ${YELLOW}${PROTOCOL}://${SERVER_IP}:3001/webhook${NC}"

# Next steps
echo -e "\n${BLUE}Next Steps:${NC}"
echo -e "  1. Review .env file: ${YELLOW}cat .env${NC}"
echo -e "  2. Setup database: ${YELLOW}./setup-database.sh${NC}"
echo -e "  3. Build frontend: ${YELLOW}docker-compose build --no-cache frontend${NC}"
echo -e "  4. Start services: ${YELLOW}docker-compose up -d${NC}"
echo -e "  5. Test backend: ${YELLOW}curl ${PROTOCOL}://${SERVER_IP}:3001/api/health${NC}"
echo -e "  6. Access frontend: ${YELLOW}${PROTOCOL}://${SERVER_IP}:3000${NC}"

echo -e "\n${GREEN}✅ Configuration complete!${NC}"

# Ask if user wants to continue with setup
echo -e "\n${BLUE}Would you like to continue with setup now?${NC}"
read -p "Run setup-database.sh and rebuild services? (yes/no): " continue_setup

if [ "$continue_setup" == "yes" ]; then
    echo -e "\n${BLUE}Starting setup...${NC}\n"
    
    # Make setup-database.sh executable
    chmod +x setup-database.sh
    
    # Run database setup
    ./setup-database.sh
    
    echo -e "\n${BLUE}Rebuilding frontend...${NC}"
    docker-compose build --no-cache frontend
    
    echo -e "\n${BLUE}Starting all services...${NC}"
    docker-compose up -d
    
    echo -e "\n${BLUE}Waiting for services to start...${NC}"
    sleep 10
    
    echo -e "\n${BLUE}Service Status:${NC}"
    docker-compose ps
    
    echo -e "\n${GREEN}✅ Setup complete!${NC}"
    echo -e "\n${BLUE}Access your application at:${NC}"
    echo -e "  Frontend: ${YELLOW}${PROTOCOL}://${SERVER_IP}:3000${NC}"
    echo -e "  Backend: ${YELLOW}${PROTOCOL}://${SERVER_IP}:3001${NC}"
    echo -e "  Webhook: ${YELLOW}${PROTOCOL}://${SERVER_IP}:3001/webhook${NC}"
else
    echo -e "\n${YELLOW}Setup skipped. Run the commands above manually.${NC}"
fi
