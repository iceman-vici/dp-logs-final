const { Pool } = require('pg');

// Database configuration
const pool = new Pool({
  user: process.env.DB_USER || 'dp_calls',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'dialpad_calls_db',
  password: process.env.DB_PASSWORD || 'dp_calls_pwd_2024',
  port: process.env.DB_PORT || 5432,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection cannot be established
});

// Test database connection
pool.on('connect', () => {
  console.log('Database pool: New client connected');
});

pool.on('error', (err, client) => {
  console.error('Database pool error:', err);
});

// Helper function to check if table exists and get the right table name
async function getTableName() {
  try {
    // Check if call_logs table exists
    const checkCallLogs = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'call_logs'
      );
    `);
    
    if (checkCallLogs.rows[0].exists) {
      return 'call_logs';
    }
    
    // Check if calls table exists
    const checkCalls = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'calls'
      );
    `);
    
    if (checkCalls.rows[0].exists) {
      return 'calls';
    }
    
    // Default to call_logs (what the app expects)
    return 'call_logs';
  } catch (error) {
    console.error('Error checking table names:', error);
    return 'call_logs'; // Default
  }
}

module.exports = { 
  pool,
  getTableName 
};