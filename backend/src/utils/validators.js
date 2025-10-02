// Data validation utilities

const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const isValidPhone = (phone) => {
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, '');
  // Check if it's a valid phone number (10-15 digits)
  return cleaned.length >= 10 && cleaned.length <= 15;
};

const isValidUUID = (uuid) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

const isValidISODate = (dateString) => {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
};

const isValidTimestamp = (timestamp) => {
  const num = Number(timestamp);
  return !isNaN(num) && num > 0;
};

const sanitizeString = (str) => {
  if (!str) return '';
  return str.trim().replace(/[<>]/g, '');
};

const validateCallData = (call) => {
  const errors = [];

  if (!call.call_id) {
    errors.push('call_id is required');
  }

  if (!call.contact || !call.contact.id) {
    errors.push('contact.id is required');
  }

  if (!call.date_started || !isValidTimestamp(call.date_started)) {
    errors.push('valid date_started timestamp is required');
  }

  if (!call.direction || !['inbound', 'outbound'].includes(call.direction)) {
    errors.push('direction must be either inbound or outbound');
  }

  if (!call.state) {
    errors.push('state is required');
  }

  if (call.duration && typeof call.duration !== 'number') {
    errors.push('duration must be a number');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

const validatePaginationParams = (params) => {
  const { limit = 10, offset = 0, page = 1, perPage = 10 } = params;
  
  return {
    limit: Math.min(Math.max(1, parseInt(limit) || 10), 100),
    offset: Math.max(0, parseInt(offset) || 0),
    page: Math.max(1, parseInt(page) || 1),
    perPage: Math.min(Math.max(1, parseInt(perPage) || 10), 100)
  };
};

module.exports = {
  isValidEmail,
  isValidPhone,
  isValidUUID,
  isValidISODate,
  isValidTimestamp,
  sanitizeString,
  validateCallData,
  validatePaginationParams
};