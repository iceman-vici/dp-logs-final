// Application constants

module.exports = {
  // API Limits
  MAX_CALLS_PER_REQUEST: 100,
  DEFAULT_CALLS_LIMIT: 10,
  MAX_SYNC_DAYS: 90,
  
  // Cache TTL (in milliseconds)
  CACHE_TTL: {
    CALLS: 5 * 60 * 1000,        // 5 minutes
    USER_STATS: 10 * 60 * 1000,   // 10 minutes
    SUMMARY: 15 * 60 * 1000,      // 15 minutes
  },
  
  // Dialpad API
  DIALPAD: {
    BASE_URL: 'https://dialpad.com/api/v2',
    RATE_LIMIT: 100,              // requests per minute
    TIMEOUT: 30000,               // 30 seconds
  },
  
  // Call States
  CALL_STATES: {
    COMPLETED: 'completed',
    MISSED: 'missed',
    CANCELLED: 'cancelled',
    ABANDONED: 'abandoned',
    REJECTED: 'rejected',
    HANGUP: 'hangup',
    VOICEMAIL: 'voicemail',
  },
  
  // Call Directions
  CALL_DIRECTIONS: {
    INBOUND: 'inbound',
    OUTBOUND: 'outbound',
  },
  
  // User Types
  USER_TYPES: {
    AGENT: 'agent',
    SUPERVISOR: 'supervisor',
    ADMIN: 'admin',
    CONTACT: 'contact',
  },
  
  // Time Zones
  TIMEZONES: {
    DEFAULT: 'America/New_York',
    UTC: 'UTC',
  },
  
  // Error Messages
  ERRORS: {
    DB_CONNECTION: 'Failed to connect to database',
    DIALPAD_API: 'Failed to fetch data from Dialpad',
    INVALID_DATE_RANGE: 'Invalid date range provided',
    NO_DATA_FOUND: 'No data found for the specified criteria',
    UNAUTHORIZED: 'Unauthorized access',
    RATE_LIMIT: 'Rate limit exceeded',
  },
  
  // Success Messages
  MESSAGES: {
    SYNC_SUCCESS: 'Data synchronized successfully',
    DELETE_SUCCESS: 'Record deleted successfully',
    UPDATE_SUCCESS: 'Record updated successfully',
  },
};