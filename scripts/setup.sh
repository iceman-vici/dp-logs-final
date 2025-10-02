#!/bin/bash

# Dialpad Logs System Setup Script

set -e

echo "🚀 Setting up Dialpad Logs System..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js v14 or higher."
    exit 1
fi

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "⚠️  PostgreSQL is not installed. You'll need it to run the database."
    echo "   You can use Docker Compose instead: docker-compose up"
fi

# Setup Backend
echo "\n📦 Setting up Backend..."
cd backend

# Copy environment file
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Backend .env file created. Please update it with your credentials."
else
    echo "✅ Backend .env file already exists."
fi

# Install backend dependencies
echo "Installing backend dependencies..."
npm install

# Setup Frontend
echo "\n📦 Setting up Frontend..."
cd ../frontend

# Copy environment file
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Frontend .env file created."
else
    echo "✅ Frontend .env file already exists."
fi

# Install frontend dependencies
echo "Installing frontend dependencies..."
npm install

cd ..

echo "\n✅ Setup complete!"
echo "\n📋 Next steps:"
echo "1. Update backend/.env with your database and Dialpad API credentials"
echo "2. Set up your PostgreSQL database and run the schema from backend/database/schema.sql"
echo "3. Start the backend: cd backend && npm run dev"
echo "4. Start the frontend: cd frontend && npm start"
echo "\n🐳 Or use Docker Compose: docker-compose up"
echo "\n🎉 Happy coding!"