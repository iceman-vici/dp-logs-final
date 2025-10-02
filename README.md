# Dialpad Logs System

A comprehensive system for managing and analyzing Dialpad call logs with React frontend and Node.js backend.

## Project Structure

```
dp-logs-final/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── routes/
│   │   └── utils/
│   ├── server.js
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── services/
│   │   └── styles/
│   ├── public/
│   ├── package.json
│   └── .env.example
└── README.md
```

## Features

- **Call Log Management**: Download and store Dialpad call logs
- **User Statistics**: Analyze call patterns and user performance
- **Date Range Filtering**: Select specific time periods for data retrieval
- **Real-time Updates**: Refresh data on demand
- **PostgreSQL Integration**: Robust data storage and retrieval

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL database
- Dialpad API token
- npm or yarn

## Quick Start

### 1. Clone the repository
```bash
git clone https://github.com/iceman-vici/dp-logs-final.git
cd dp-logs-final
```

### 2. Install dependencies

#### Option A: Using npm scripts (Recommended)
```bash
# Install all dependencies (root, backend, and frontend)
npm run install:all
```

#### Option B: Manual installation
```bash
# Install root dependencies
npm install

# Install backend dependencies
cd backend
npm install
cd ..

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### 3. Configure environment variables

#### Backend configuration
```bash
cd backend
cp .env.example .env
# Edit .env with your database and Dialpad API credentials
```

Backend .env variables:
```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=dialpad_logs

# Dialpad API Configuration
DIALPAD_TOKEN=your_dialpad_api_token

# Server Configuration
PORT=3001
NODE_ENV=development
```

#### Frontend configuration
```bash
cd ../frontend
cp .env.example .env
# Usually no changes needed for development
```

### 4. Database Setup

Create the database and run the schema:

```bash
# Create database
psql -U postgres -c "CREATE DATABASE dialpad_logs;"

# Run schema
psql -U postgres -d dialpad_logs -f backend/database/schema.sql
```

### 5. Start the application

#### Development mode (both backend and frontend)
```bash
# From root directory
npm run dev
```

This will start:
- Backend server on http://localhost:3001
- Frontend dev server on http://localhost:3000

#### Start services individually
```bash
# Backend only
cd backend
npm run dev

# Frontend only
cd frontend
npm start
```

## Using Docker

For a containerized setup:

```bash
# Start all services
docker-compose up

# Stop services
docker-compose down
```

## Available Scripts

From the root directory:

- `npm run install:all` - Install all dependencies
- `npm run dev` - Start both backend and frontend in development mode
- `npm run dev:backend` - Start backend only
- `npm run dev:frontend` - Start frontend only
- `npm run build` - Build frontend for production
- `npm run docker:up` - Start Docker containers
- `npm run docker:down` - Stop Docker containers

## API Endpoints

- `GET /api/calls` - Retrieve recent calls
- `GET /api/stats/users` - Get user call statistics
- `GET /api/sync/download` - Download and insert calls from Dialpad
- `GET /api/health` - Health check endpoint

## Troubleshooting

### Common Issues

1. **Port already in use**
   - Change the PORT in backend/.env
   - Update REACT_APP_API_URL in frontend/.env accordingly

2. **Database connection failed**
   - Verify PostgreSQL is running
   - Check database credentials in backend/.env
   - Ensure database exists: `psql -U postgres -lqt | cut -d \| -f 1 | grep dialpad_logs`

3. **Dialpad API errors**
   - Verify your DIALPAD_TOKEN is valid
   - Check API rate limits

4. **Module not found errors**
   - Run `npm run install:all` from root
   - Delete node_modules and package-lock.json, then reinstall

## Technologies Used

- **Frontend**: React, Axios, React DatePicker, date-fns
- **Backend**: Node.js, Express, PostgreSQL, Axios
- **Database**: PostgreSQL
- **DevOps**: Docker, Docker Compose

## License

MIT

## Support

For issues or questions, please open an issue on [GitHub](https://github.com/iceman-vici/dp-logs-final/issues).