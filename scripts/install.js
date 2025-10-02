#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Installing Dialpad Logs System dependencies...');

try {
  // Install root dependencies first
  console.log('\n📦 Installing root dependencies...');
  execSync('npm install', { stdio: 'inherit' });

  // Install backend dependencies
  console.log('\n📦 Installing backend dependencies...');
  process.chdir('backend');
  execSync('npm install', { stdio: 'inherit' });
  
  // Copy .env.example to .env if it doesn't exist
  if (!fs.existsSync('.env')) {
    fs.copyFileSync('.env.example', '.env');
    console.log('✅ Backend .env file created. Please update it with your credentials.');
  }
  
  // Install frontend dependencies
  console.log('\n📦 Installing frontend dependencies...');
  process.chdir('../frontend');
  execSync('npm install', { stdio: 'inherit' });
  
  // Copy .env.example to .env if it doesn't exist
  if (!fs.existsSync('.env')) {
    fs.copyFileSync('.env.example', '.env');
    console.log('✅ Frontend .env file created.');
  }
  
  // Go back to root
  process.chdir('..');
  
  console.log('\n✅ Installation complete!');
  console.log('\n📋 Next steps:');
  console.log('1. Update backend/.env with your database and Dialpad API credentials');
  console.log('2. Set up your PostgreSQL database and run the schema from backend/database/schema.sql');
  console.log('3. Run "npm run dev" to start both backend and frontend');
  console.log('\n🎉 Happy coding!');
  
} catch (error) {
  console.error('\n❌ Installation failed:', error.message);
  process.exit(1);
}