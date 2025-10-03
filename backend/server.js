const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { pool } = require('./src/config/database');
const callsRouter = require('./src/routes/calls');
const statsRouter = require('./src/routes/stats');
const syncRouter = require('./src/routes/sync');
const webhookRouter = require('./src/routes/webhook');

const app = express();
const port = process.env.PORT || 3001;

// Security middleware
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : '*',
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Body parsing middleware (before rate limiting for webhooks)
app.use(express.json({ limit: '10mb' })); // Increase limit for webhook payloads
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting for API routes (not webhook)
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  skip: (req) => req.path.startsWith('/webhook') // Skip rate limiting for webhooks
});
app.use('/api', limiter);

// Logging
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to database:', err.stack);
    process.exit(1);
  }
  console.log('Successfully connected to PostgreSQL database');
  release();
});

// Routes
app.use('/api/calls', callsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/sync', syncRouter);

// Webhook route (no /api prefix for external webhook calls)
app.use('/webhook', webhookRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    name: 'Dialpad Call Logs API',
    version: '1.0.0',
    endpoints: {
      api: {
        calls: '/api/calls',
        stats: '/api/stats',
        sync: '/api/sync',
        health: '/api/health'
      },
      webhook: {
        main: '/webhook',
        health: '/webhook/health',
        stats: '/webhook/stats',
        logs: '/webhook/logs',
        test: '/webhook/test (dev only)'
      }
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Webhook endpoint: http://localhost:${port}/webhook`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  app.close(() => {
    console.log('HTTP server closed');
    pool.end(() => {
      console.log('Database pool closed');
      process.exit(0);
    });
  });
});
