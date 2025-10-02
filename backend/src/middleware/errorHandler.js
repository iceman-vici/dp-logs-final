const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      error: 'Validation Error',
      details: errors
    });
  }

  // PostgreSQL errors
  if (err.code === '23505') {
    return res.status(409).json({
      error: 'Duplicate entry',
      details: 'A record with this ID already exists'
    });
  }

  if (err.code === '23503') {
    return res.status(400).json({
      error: 'Foreign key constraint violation',
      details: 'Referenced record does not exist'
    });
  }

  if (err.code === '22P02') {
    return res.status(400).json({
      error: 'Invalid input syntax',
      details: 'Please check your input data format'
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Invalid token',
      details: 'Authentication token is invalid'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token expired',
      details: 'Authentication token has expired'
    });
  }

  // Default error
  const status = err.status || 500;
  const message = err.message || 'Internal server error';

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;