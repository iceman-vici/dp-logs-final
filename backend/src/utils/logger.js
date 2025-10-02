const fs = require('fs');
const path = require('path');
const util = require('util');

class Logger {
  constructor() {
    this.logDir = path.join(__dirname, '../../logs');
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  getTimestamp() {
    return new Date().toISOString();
  }

  formatMessage(level, message, meta = {}) {
    return {
      timestamp: this.getTimestamp(),
      level,
      message,
      ...meta
    };
  }

  writeToFile(filename, data) {
    const filePath = path.join(this.logDir, filename);
    const logEntry = JSON.stringify(data) + '\n';
    
    fs.appendFile(filePath, logEntry, (err) => {
      if (err) console.error('Error writing to log file:', err);
    });
  }

  log(level, message, meta = {}) {
    const formattedMessage = this.formatMessage(level, message, meta);
    
    // Console output
    const consoleMessage = `[${formattedMessage.timestamp}] [${level.toUpperCase()}]: ${message}`;
    
    switch (level) {
      case 'error':
        console.error(consoleMessage, meta);
        this.writeToFile('error.log', formattedMessage);
        break;
      case 'warn':
        console.warn(consoleMessage, meta);
        this.writeToFile('warning.log', formattedMessage);
        break;
      case 'info':
        console.log(consoleMessage, meta);
        this.writeToFile('info.log', formattedMessage);
        break;
      case 'debug':
        if (process.env.NODE_ENV === 'development') {
          console.debug(consoleMessage, meta);
          this.writeToFile('debug.log', formattedMessage);
        }
        break;
      default:
        console.log(consoleMessage, meta);
        this.writeToFile('general.log', formattedMessage);
    }

    // Also write to combined log
    this.writeToFile('combined.log', formattedMessage);
  }

  error(message, meta = {}) {
    this.log('error', message, meta);
  }

  warn(message, meta = {}) {
    this.log('warn', message, meta);
  }

  info(message, meta = {}) {
    this.log('info', message, meta);
  }

  debug(message, meta = {}) {
    this.log('debug', message, meta);
  }

  // Log API requests
  logRequest(req) {
    this.info('API Request', {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
  }

  // Log API responses
  logResponse(req, res, responseTime) {
    this.info('API Response', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`
    });
  }

  // Log database queries
  logQuery(query, params, duration) {
    this.debug('Database Query', {
      query: query.substring(0, 200), // Truncate long queries
      params,
      duration: `${duration}ms`
    });
  }

  // Log Dialpad API calls
  logDialpadCall(endpoint, params, response, duration) {
    this.info('Dialpad API Call', {
      endpoint,
      params,
      statusCode: response?.status,
      duration: `${duration}ms`
    });
  }
}

module.exports = new Logger();