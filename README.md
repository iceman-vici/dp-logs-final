# Dialpad Logs System

A comprehensive call logging and analytics system for Dialpad, featuring automatic synchronization, retry capabilities, and detailed logging.

## Features

- 📞 **Call Data Sync**: Automatic synchronization with Dialpad API
- 🔄 **Background Processing**: Non-blocking sync operations
- 🔁 **Retry Mechanism**: Automatic retry for failed call insertions
- 📊 **Analytics Dashboard**: Real-time call statistics and user metrics
- 📋 **Detailed Logging**: Complete audit trail of all sync operations
- 🌐 **Timezone Support**: Proper NY timezone handling
- 🐳 **Docker Support**: Complete containerized deployment

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

# Edit .env and add your Dialpad API token
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
- **pgAdmin**: http://localhost:5050 (admin@dialpad.local / admin)

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
│   │   ├── routes/      # API endpoints
│   │   └── utils/       # Helper functions
│   ├── database/
│   │   └── schema.sql   # Database schema
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── services/    # API services
│   │   └── styles/      # CSS files
│   └── Dockerfile
├── docker-compose.yml    # Docker configuration
├── Makefile             # Convenience commands
└── README.md
```

## API Endpoints

### Sync Endpoints

- `POST /api/sync/start` - Start background sync job
- `GET /api/sync/status/:jobId` - Check job status
- `GET /api/sync/logs` - Get sync history
- `GET /api/sync/logs/:syncId/details` - Get sync details
- `POST /api/sync/retry/:syncId` - Retry failed calls
- `GET /api/sync/download-quick` - Quick sync (50 calls)

### Data Endpoints

- `GET /api/calls` - Get all calls
- `GET /api/stats/users` - Get user statistics
- `GET /api/stats/summary` - Get call summary

## Environment Variables

```env
# Required
DIALPAD_TOKEN=your_dialpad_api_token

# Database (Docker defaults)
DB_HOST=postgres
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=dialpad_logs

# API
PORT=3001
CORS_ORIGINS=http://localhost:3000
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

### Reset Everything

```bash
# Complete cleanup and fresh start
make clean
make install
```

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.