/**
 * Format milliseconds to MM:SS format
 * @param {number} ms - Duration in milliseconds
 * @returns {string} - Formatted duration string
 */
function formatDurationMs(ms) {
  if (!ms || ms === 0) return '0s';
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }
  
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Format phone number for display
 * @param {string} phone - Phone number
 * @returns {string} - Formatted phone number
 */
function formatPhoneNumber(phone) {
  if (!phone) return 'N/A';
  
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, '');
  
  // Format as (XXX) XXX-XXXX for US numbers
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  
  return phone;
}

/**
 * Format date for display
 * @param {number|string} date - Date value
 * @returns {string} - Formatted date string
 */
function formatDate(date) {
  if (!date) return 'N/A';
  
  const dateObj = typeof date === 'number' ? new Date(date) : new Date(date);
  return dateObj.toLocaleString();
}

module.exports = {
  formatDurationMs,
  formatPhoneNumber,
  formatDate
};