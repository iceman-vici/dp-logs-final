#!/bin/bash

echo "🚀 Setting up Dialpad Calls Database"

# Database configuration
DB_USER="dp_calls"
DB_PASSWORD="dp_logs"
DB_NAME="dialpad_calls_db"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Configuration:${NC}"
echo -e "  Database: ${YELLOW}$DB_NAME${NC}"
echo -e "  User: ${YELLOW}$DB_USER${NC}"
echo -e "  Password: ${YELLOW}$DB_PASSWORD${NC}"
echo ""

# Stop existing services and remove volumes
echo "Stopping existing services..."
docker-compose down -v

# Start services with new configuration
echo "Starting Docker services..."
docker-compose up -d

# Wait for PostgreSQL
echo "Waiting for PostgreSQL to start..."
sleep 15

until docker-compose exec -T postgres pg_isready -U $DB_USER > /dev/null 2>&1; do
    echo "Still waiting for PostgreSQL..."
    sleep 3
done

echo -e "${GREEN}✅ PostgreSQL is ready${NC}"

# Verify database was created
echo "Verifying database..."
DB_EXISTS=$(docker-compose exec -T postgres psql -U $DB_USER -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" 2>/dev/null)

if [ "$DB_EXISTS" == "1" ]; then
    echo -e "${GREEN}✅ Database '$DB_NAME' exists${NC}"
else
    echo -e "${RED}❌ Database not created automatically. Creating manually...${NC}"
    docker-compose exec -T postgres psql -U $DB_USER -c "CREATE DATABASE $DB_NAME;"
fi

# Run migrations
echo -e "\n${BLUE}📝 Running migrations...${NC}\n"

migrations=(
    "schema.sql"
    "fix-table-names.sql"
    "migration-fix-timestamps.sql"
    "add-recording-id-correct.sql"
    "migration-webhook-logs.sql"
    "schedule-schema.sql"
)

for migration in "${migrations[@]}"; do
    if [ -f "backend/database/$migration" ]; then
        echo "Running: $migration"
        if docker-compose exec -T postgres psql -U $DB_USER -d $DB_NAME < "backend/database/$migration" > /tmp/migration_output.log 2>&1; then
            echo -e "${GREEN}✅ $migration completed${NC}"
        else
            # Check if it's just warnings/notices
            if grep -qi "error" /tmp/migration_output.log; then
                echo -e "${RED}❌ $migration failed${NC}"
                cat /tmp/migration_output.log | grep -i error | head -5
            else
                echo -e "${GREEN}✅ $migration completed (with notices)${NC}"
            fi
        fi
    else
        echo -e "${YELLOW}⚠️  $migration not found, skipping${NC}"
    fi
done

# Verify setup
echo -e "\n${BLUE}📊 Verifying database setup...${NC}\n"

echo "Tables created:"
docker-compose exec -T postgres psql -U $DB_USER -d $DB_NAME -c "
SELECT tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;
"

echo -e "\nViews created:"
docker-compose exec -T postgres psql -U $DB_USER -d $DB_NAME -c "
SELECT viewname 
FROM pg_views 
WHERE schemaname = 'public' 
ORDER BY viewname;
"

echo -e "\nDatabase statistics:"
docker-compose exec -T postgres psql -U $DB_USER -d $DB_NAME -c "
SELECT 
    'Tables' as type,
    COUNT(*) as count
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
UNION ALL
SELECT 
    'Views',
    COUNT(*)
FROM information_schema.views 
WHERE table_schema = 'public';
"

# Test connection
echo -e "\n${BLUE}Testing database connection...${NC}"
if docker-compose exec -T postgres psql -U $DB_USER -d $DB_NAME -c "SELECT 'Connection successful!' as status;" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Database connection test passed${NC}"
else
    echo -e "${RED}❌ Database connection test failed${NC}"
fi

# Clean up
rm -f /tmp/migration_output.log

echo -e "\n${GREEN}✅ Database setup complete!${NC}"
echo -e "\n${BLUE}Connection Details:${NC}"
echo -e "  Host: ${YELLOW}localhost${NC} (or ${YELLOW}postgres${NC} from Docker)"
echo -e "  Port: ${YELLOW}5432${NC}"
echo -e "  Database: ${YELLOW}$DB_NAME${NC}"
echo -e "  User: ${YELLOW}$DB_USER${NC}"
echo -e "  Password: ${YELLOW}$DB_PASSWORD${NC}"

echo -e "\n${BLUE}Next steps:${NC}"
echo -e "  1. Copy .env.example to .env: ${YELLOW}cp .env.example .env${NC}"
echo -e "  2. Update .env with your DIALPAD_TOKEN"
echo -e "  3. Restart services: ${YELLOW}docker-compose restart${NC}"
echo -e "  4. Test webhook: ${YELLOW}bash scripts/test-webhook.sh${NC}"
echo -e "  5. Access frontend: ${YELLOW}http://localhost:3000${NC}"
echo -e "  6. Access backend: ${YELLOW}http://localhost:3001${NC}"
