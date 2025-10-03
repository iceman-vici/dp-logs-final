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

## Quick Start with Docker

### 1. Clone the repository

```bash
git clone https://github.com/iceman-vici/dp-logs-final.git
cd dp-logs-final
```

### 2. Setup environment

```bash
# Copy example environment file
cp .env.example .env

# Edit .env and add your Dialpad API token and webhook secret
nano .env  # or use your preferred editor
```

### 3. Start with Docker

```bash
# Using Make (recommended)
make install  # Complete setup, build, and start

# OR using Docker Compose directly
docker-compose up -d
```

### 4. Access the application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **Webhook Endpoint**: http://localhost:3001/webhook
- **pgAdmin**: http://localhost:5050 (admin@dialpad.local / admin)

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

## Docker Commands

### Using Make (Recommended)

```bash
make help        # Show all available commands
make setup       # Initial setup
make build       # Build containers
make up          # Start services
make down        # Stop services
make logs        # View logs
make db-shell    # Access PostgreSQL
make status      # Check service status
make clean       # Clean up everything
```

### Using Docker Compose

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Reset database
docker-compose down -v
docker-compose up -d

# Access database
docker-compose exec postgres psql -U postgres -d dialpad_logs
```

## Database Management

### Access PostgreSQL

```bash
# Using Make
make db-shell

# Using Docker
docker-compose exec postgres psql -U postgres -d dialpad_logs
```

### Run Webhook Migration

```bash
# Create webhook_logs table and related objects
docker-compose exec postgres psql -U postgres -d dialpad_logs \
  -f /docker-entrypoint-initdb.d/migration-webhook-logs.sql
```

### Backup Database

```bash
# Create backup
make backup-db

# Restore backup
make restore-db FILE=backups/backup_20240101_120000.sql
```

### Reset Database

```bash
# WARNING: This deletes all data
make db-reset
```

## Development

### Local Development with Docker

```bash
# Start in development mode with hot reload
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

### Manual Setup (Without Docker)

```bash
# Backend
cd backend
cp .env.example .env  # Configure database and API token
npm install
npm run dev

# Frontend
cd frontend
npm install
npm start
```

## Project Structure

```
dp-logs-final/
├── backend/
│   ├── src/
│   │   ├── config/      # Database and app configuration
│   │   ├── routes/      # API endpoints (including webhook)
│   │   ├── services/    # Business logic (webhook, sync, etc.)
│   │   ├── middleware/  # Authentication and request processing
│   │   └── utils/       # Helper functions
│   ├── database/
│   │   ├── schema.sql   # Main database schema
│   │   └── migration-webhook-logs.sql  # Webhook tables
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── services/    # API services
│   │   └── styles/      # CSS files
│   └── Dockerfile
├── docs/
│   ├── WEBHOOK_SETUP.md          # Complete webhook guide
│   └── WEBHOOK_QUICK_REFERENCE.md # Quick reference
├── docker-compose.yml    # Docker configuration
├── Makefile             # Convenience commands
└── README.md
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
WEBHOOK_SECRET=dp_call_logs  # Must match Dialpad webhook config

# Database (Docker defaults)
DB_HOST=postgres
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=dialpad_logs

# API
PORT=3001
CORS_ORIGINS=http://localhost:3000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## Webhook Setup

### 1. Configure Environment

Add to your `.env` file:
```bash
WEBHOOK_SECRET=dp_call_logs
```

### 2. Run Database Migration

```bash
docker-compose exec postgres psql -U postgres -d dialpad_logs \
  -f /app/database/migration-webhook-logs.sql
```

### 3. Configure Dialpad

Set up your webhook in Dialpad with:
- **URL**: `https://your-domain.com/webhook`
- **Algorithm**: HS256
- **Secret**: `dp_call_logs`
- **Type**: JWT

### 4. Test the Webhook

```bash
# Check health
curl http://localhost:3001/webhook/health

# View statistics
curl http://localhost:3001/webhook/stats

# Test (dev only)
curl -X POST http://localhost:3001/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"call":{"id":"test123","duration":120}}'
```

For detailed setup instructions, see [WEBHOOK_SETUP.md](docs/WEBHOOK_SETUP.md)

## Monitoring

### Check Webhook Activity

```bash
# View webhook statistics
curl http://localhost:3001/webhook/stats

# View recent webhook logs
curl http://localhost:3001/webhook/logs?limit=20

# Check health
curl http://localhost:3001/webhook/health
```

### Database Queries

```sql
-- View webhook statistics
SELECT * FROM webhook_stats_view;

-- View recent webhook activity
SELECT * FROM webhook_recent_activity LIMIT 20;

-- Check for failed webhooks
SELECT * FROM webhook_logs 
WHERE status = 'failed' 
ORDER BY processed_at DESC 
LIMIT 10;
```

## Troubleshooting

### Port Already in Use

```bash
# Stop services using the ports
sudo lsof -i :3000  # Find process using port 3000
sudo lsof -i :3001  # Find process using port 3001
sudo lsof -i :5432  # Find process using port 5432

# Or change ports in docker-compose.yml
```

### Database Connection Issues

```bash
# Check if database is running
make test-db

# View database logs
make logs-db

# Restart database
docker-compose restart postgres
```

### Webhook Issues

```bash
# Check webhook health
curl http://localhost:3001/webhook/health

# View recent webhook errors
curl http://localhost:3001/webhook/logs | grep -i error

# Enable debug mode
NODE_ENV=development docker-compose up
```

### Reset Everything

```bash
# Complete cleanup and fresh start
make clean
make install
```

## Security Notes

- **JWT Authentication**: Webhooks use JWT signature verification
- **HTTPS Required**: Use HTTPS in production for webhook endpoints
- **Secret Management**: Never commit secrets to version control
- **Rate Limiting**: API endpoints have rate limiting enabled
- **CORS**: Configure CORS_ORIGINS for production

## Documentation

- [Webhook Setup Guide](docs/WEBHOOK_SETUP.md) - Complete webhook configuration
- [Webhook Quick Reference](docs/WEBHOOK_QUICK_REFERENCE.md) - Quick commands and troubleshooting

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.
