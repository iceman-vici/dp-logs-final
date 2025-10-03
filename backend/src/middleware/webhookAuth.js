const jwt = require('jsonwebtoken');

/**
 * Middleware to verify Dialpad webhook JWT signature
 * Validates the JWT token from the Authorization header
 */
const verifyWebhookSignature = (req, res, next) => {
  try {
    // Get the authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      console.error('Webhook: No authorization header provided');
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'No authorization header provided' 
      });
    }

    // Extract the token (format: "Bearer <token>")
    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : authHeader;

    if (!token) {
      console.error('Webhook: No token provided');
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'No token provided' 
      });
    }

    // Get the webhook secret from environment or use default
    const webhookSecret = process.env.WEBHOOK_SECRET || 'dp_call_logs';

    // Verify the JWT token
    const decoded = jwt.verify(token, webhookSecret, {
      algorithms: ['HS256']
    });

    // Attach decoded payload to request for later use
    req.webhookPayload = decoded;
    
    console.log('Webhook: JWT verified successfully', {
      iat: decoded.iat,
      exp: decoded.exp,
      hasBody: !!decoded.body
    });

    next();
  } catch (error) {
    console.error('Webhook: JWT verification failed', {
      error: error.message,
      name: error.name
    });

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Token expired' 
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Invalid token' 
      });
    }

    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Token verification failed' 
    });
  }
};

/**
 * Optional: Middleware to log webhook requests
 */
const logWebhookRequest = (req, res, next) => {
  console.log('Webhook request received', {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    contentType: req.headers['content-type'],
    bodySize: req.headers['content-length'] || 'unknown'
  });
  next();
};

module.exports = {
  verifyWebhookSignature,
  logWebhookRequest
};
