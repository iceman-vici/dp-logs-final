# Dialpad Logs System

A comprehensive call logging and analytics system for Dialpad, featuring automatic synchronization, webhook support, retry capabilities, and detailed logging.

## Features

- 📞 **Call Data Sync**: Automatic synchronization with Dialpad API
- 🎣 **Webhook Support**: Real-time call events via Dialpad webhooks with JWT authentication
- 🔄 **Background Processing**: Non-blocking sync operations
- 🔁 **Retry Mechanism**: Automatic retry for failed call insertions
- 📊 **Analytics Dashboard**: Real-time call statistics and user metrics
- 📋 **Detailed Logging**: Complete audit trail of all sync operations
- 🌐 **Timezone Support**: Proper NY timezone handling
- 🐳 **Docker Support**: Complete containerized deployment
- 🔐 **Secure Webhooks**: JWT signature verification for webhook authenticity

## Prerequisites

- Docker and Docker Compose
- Dialpad API Token
- Node.js 18+ (for local development)
- PostgreSQL 15+ (if not using Docker)

## Quick Start

### Option 1: Interactive Configuration (Recommended)

```bash
git clone https://github.com/iceman-vici/dp-logs-final.git
cd dp-logs-final

# Run interactive configuration
chmod +x configure.sh
./configure.sh
```

The script will:
- Auto-detect your server IP
- Configure CORS and API URLs
- Set up your Dialpad token
- Run database setup
- Build and start all services

### Option 2: Manual Setup

#### 1. Clone the repository

```bash
git clone https://github.com/iceman-vici/dp-logs-final.git
cd dp-logs-final
```

#### 2. Configure for your server

```bash
# Copy example environment file
cp .env.example .env

# Edit and configure
nano .env
```

**Important:** Update these settings for external access:
```bash
# Replace YOUR_SERVER_IP with your actual IP or domain
CORS_ORIGINS=http://localhost:3000,http://YOUR_SERVER_IP:3000,http://YOUR_SERVER_IP:3001
REACT_APP_API_URL=http://YOUR_SERVER_IP:3001/api
DIALPAD_TOKEN=your_actual_token
```

📚 **See [Server Configuration Guide](docs/SERVER_CONFIGURATION.md) for detailed instructions**

#### 3. Setup and start

```bash
# Setup database
chmod +x setup-database.sh
./setup-database.sh

# Rebuild frontend with your server IP
docker-compose build --no-cache frontend

# Start all services
docker-compose up -d
```

#### 4. Access the application

- **Frontend**: http://YOUR_SERVER_IP:3000
- **Backend API**: http://YOUR_SERVER_IP:3001
- **Webhook Endpoint**: http://YOUR_SERVER_IP:3001/webhook
- **pgAdmin**: http://YOUR_SERVER_IP:5050 (admin@dialpad.local / admin)

## Configuration

### For Local Development

Use default `localhost` configuration:
```bash
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
REACT_APP_API_URL=http://localhost:3001/api
```

### For External Access

Update with your server IP or domain:
```bash
# Example with IP address
CORS_ORIGINS=http://localhost:3000,http://194.163.40.197:3000,http://194.163.40.197:3001
REACT_APP_API_URL=http://194.163.40.197:3001/api

# Example with domain
CORS_ORIGINS=https://calls.yourdomain.com
REACT_APP_API_URL=https://calls.yourdomain.com/api
```

⚠️ **Important:** After changing `REACT_APP_API_URL`, you must rebuild the frontend:
```bash
docker-compose build --no-cache frontend
docker-compose up -d
```

## Data Collection Methods

### Method 1: API Sync (Polling)

The traditional method of periodically fetching call logs from the Dialpad API.

**Use Cases:**
- Historical data imports
- Scheduled batch processing
- Backup sync method

**Endpoints:**
- `POST /api/sync/start` - Start background sync job
- `GET /api/sync/status/:jobId` - Check job status
- `GET /api/sync/logs` - Get sync history

### Method 2: Webhooks (Real-time)

Receive call events in real-time as they happen via Dialpad webhooks.

**Use Cases:**
- Real-time call monitoring
- Immediate event processing
- Live dashboards

**Configuration:**
```json
{
  "webhook": {
    "hook_url": "https://your-domain.com/webhook",
    "signature": {
      "algo": "HS256",
      "secret": "dp_call_logs",
      "type": "jwt"
    }
  }
}
```

**Endpoints:**
- `POST /webhook` - Receive call events (JWT auth required)
- `GET /webhook/health` - Health check
- `GET /webhook/stats` - View webhook statistics
- `GET /webhook/logs` - View recent webhook logs

📚 **Documentation:**
- [Detailed Webhook Setup Guide](docs/WEBHOOK_SETUP.md)
- [Webhook Quick Reference](docs/WEBHOOK_QUICK_REFERENCE.md)
- [Server Configuration Guide](docs/SERVER_CONFIGURATION.md)

## Docker Commands

### Using the Setup Script (Recommended)

```bash
# Complete automated setup
chmod +x setup-database.sh
./setup-database.sh
```

### Using Docker Compose

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Reset database and start fresh
docker-compose down -v
./setup-database.sh

# Access database
docker-compose exec postgres psql -U dp_calls -d dialpad_calls_db
```

## Database Management

### Database Credentials

The default database configuration is:
- **Database**: `dialpad_calls_db`
- **User**: `dp_calls`
- **Password**: `dp_logs`
- **Port**: `5432`

### Access PostgreSQL

```bash
# Access database directly
docker-compose exec postgres psql -U dp_calls -d dialpad_calls_db

# Quick connection test
docker-compose exec postgres psql -U dp_calls -d dialpad_calls_db -c "SELECT 'Working!' as status;"
```

### Database Setup

The `setup-database.sh` script will:
1. Stop and clean existing containers
2. Start PostgreSQL with correct credentials
3. Create the database
4. Run all migrations in order:
   - `schema.sql` - Main tables
   - `migration-webhook-logs.sql` - Webhook tables
   - Other migration files
5. Verify the setup

### Manual Database Setup

If you prefer manual setup:

```bash
# 1. Start services
docker-compose up -d
sleep 15

# 2. Run migrations
docker-compose exec -T postgres psql -U dp_calls -d dialpad_calls_db < backend/database/schema.sql
docker-compose exec -T postgres psql -U dp_calls -d dialpad_calls_db < backend/database/migration-webhook-logs.sql

# 3. Verify
docker-compose exec postgres psql -U dp_calls -d dialpad_calls_db -c "\dt"
```

### Backup Database

```bash
# Create backup
docker-compose exec postgres pg_dump -U dp_calls dialpad_calls_db > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore backup
docker-compose exec -T postgres psql -U dp_calls -d dialpad_calls_db < backup_file.sql
```

## API Endpoints

### Sync Endpoints (API Polling Method)

- `POST /api/sync/start` - Start background sync job
- `GET /api/sync/status/:jobId` - Check job status
- `GET /api/sync/logs` - Get sync history
- `GET /api/sync/logs/:syncId/details` - Get sync details
- `POST /api/sync/retry/:syncId` - Retry failed calls
- `GET /api/sync/download-quick` - Quick sync (50 calls)

### Webhook Endpoints (Real-time Method)

- `POST /webhook` - Receive call events (JWT auth)
- `GET /webhook/health` - Health check
- `GET /webhook/stats` - View statistics
- `POST /webhook/stats/reset` - Reset statistics
- `GET /webhook/logs?limit=50` - View recent logs
- `POST /webhook/test` - Test endpoint (dev only)

### Data Endpoints

- `GET /api/calls` - Get all calls
- `GET /api/stats/users` - Get user statistics
- `GET /api/stats/summary` - Get call summary

## Environment Variables

```env
# Required
DIALPAD_TOKEN=your_dialpad_api_token
WEBHOOK_SECRET=dp_call_logs

# Database Configuration
DB_HOST=postgres
DB_PORT=5432
DB_USER=dp_calls
DB_PASSWORD=dp_logs
DB_NAME=dialpad_calls_db

# Server Configuration
PORT=3001
NODE_ENV=development

# CORS - Update with your server IP/domain
CORS_ORIGINS=http://localhost:3000,http://YOUR_IP:3000

# Frontend API URL - Update with your server IP/domain
REACT_APP_API_URL=http://YOUR_IP:3001/api

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## Troubleshooting

### CORS Errors

**Problem:** "Response body is not available to scripts (Reason: CORS Failed)"

**Solution:**
1. Update `CORS_ORIGINS` in `.env` with your server IP
2. Restart backend: `docker-compose restart backend`

Example:
```bash
CORS_ORIGINS=http://localhost:3000,http://194.163.40.197:3000,http://194.163.40.197:3001
```

### Frontend Calling localhost

**Problem:** Frontend makes requests to `localhost:3001` instead of your server IP

**Solution:**
1. Update `REACT_APP_API_URL` in `.env`
2. Rebuild frontend: `docker-compose build --no-cache frontend`
3. Restart: `docker-compose up -d`

Example:
```bash
REACT_APP_API_URL=http://194.163.40.197:3001/api
```

### Database Connection Issues

```bash
# Test database connection
docker-compose exec postgres psql -U dp_calls -d dialpad_calls_db -c "SELECT 'Connected!' as status;"

# View database logs
docker-compose logs postgres

# Restart database
docker-compose restart postgres
```

### Complete Reset

```bash
# Complete cleanup and fresh start
docker-compose down -v
./setup-database.sh
docker-compose build --no-cache frontend
docker-compose up -d
```

### Port Already in Use

```bash
# Find processes using ports
sudo lsof -i :3000  # Frontend
sudo lsof -i :3001  # Backend
sudo lsof -i :5432  # Database
```

## Security Notes

- **JWT Authentication**: Webhooks use JWT signature verification
- **HTTPS Required**: Use HTTPS in production for webhook endpoints
- **Secret Management**: Never commit secrets to version control
- **Database Credentials**: Change default credentials in production
- **Rate Limiting**: API endpoints have rate limiting enabled
- **CORS**: Always specify exact origins in production (never use `*`)

## Documentation

- [Server Configuration Guide](docs/SERVER_CONFIGURATION.md) - **External access setup**
- [Webhook Setup Guide](docs/WEBHOOK_SETUP.md) - Complete webhook configuration
- [Webhook Quick Reference](docs/WEBHOOK_QUICK_REFERENCE.md) - Quick commands
- [Changelog](docs/CHANGELOG_WEBHOOK.md) - Webhook implementation details

## Scripts

- `configure.sh` - Interactive configuration wizard
- `setup-database.sh` - Automated database setup
- `scripts/test-webhook.sh` - Webhook testing

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.
