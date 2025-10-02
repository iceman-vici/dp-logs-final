@echo off
REM Dialpad Logs System Setup Script for Windows

echo 🚀 Setting up Dialpad Logs System...

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js v14 or higher.
    exit /b 1
)

REM Setup Backend
echo.
echo 📦 Setting up Backend...
cd backend

REM Copy environment file
if not exist .env (
    copy .env.example .env
    echo ✅ Backend .env file created. Please update it with your credentials.
) else (
    echo ✅ Backend .env file already exists.
)

REM Install backend dependencies
echo Installing backend dependencies...
npm install

REM Setup Frontend
echo.
echo 📦 Setting up Frontend...
cd ..\frontend

REM Copy environment file
if not exist .env (
    copy .env.example .env
    echo ✅ Frontend .env file created.
) else (
    echo ✅ Frontend .env file already exists.
)

REM Install frontend dependencies
echo Installing frontend dependencies...
npm install

cd ..

echo.
echo ✅ Setup complete!
echo.
echo 📋 Next steps:
echo 1. Update backend\.env with your database and Dialpad API credentials
echo 2. Set up your PostgreSQL database and run the schema from backend\database\schema.sql
echo 3. Start the backend: cd backend ^&^& npm run dev
echo 4. Start the frontend: cd frontend ^&^& npm start
echo.
echo 🐳 Or use Docker Compose: docker-compose up
echo.
echo 🎉 Happy coding!

pause