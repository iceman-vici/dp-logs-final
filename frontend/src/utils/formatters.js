export const formatValue = (value, col) => {
  if (value === null || value === undefined) return 'N/A';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  
  // Format timestamps
  if (col.includes('date_') || col.includes('_at')) {
    if (typeof value === 'number' && value.toString().length > 10) {
      return new Date(value).toLocaleString();
    }
    if (typeof value === 'string') {
      return new Date(value).toLocaleString();
    }
  }
  
  // Format phone numbers
  if (col.includes('phone') || col.includes('number')) {
    return formatPhoneNumber(value);
  }
  
  // Format states
  if (col === 'state') {
    return formatCallState(value);
  }
  
  // Format direction
  if (col === 'direction') {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
  
  return value;
};

export const getFormattedDuration = (row, col) => {
  const formattedKey = col + '_formatted';
  if (row[formattedKey]) {
    return row[formattedKey];
  }
  
  const value = row[col];
  if (!value || value === 0) return '0s';
  
  // Convert milliseconds to seconds
  const totalSeconds = Math.floor(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  if (minutes === 0) {
    return `${seconds}s`;
  }
  
  return `${minutes}m ${seconds}s`;
};

export const formatPhoneNumber = (phone) => {
  if (!phone) return 'N/A';
  
  // Remove all non-numeric characters
  const cleaned = phone.toString().replace(/\D/g, '');
  
  // Format as (XXX) XXX-XXXX for US numbers
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  } else if (cleaned.length === 11 && cleaned[0] === '1') {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  
  return phone;
};

export const formatCallState = (state) => {
  if (!state) return 'N/A';
  
  const stateMap = {
    'completed': 'Completed',
    'missed': 'Missed',
    'cancelled': 'Cancelled',
    'abandoned': 'Abandoned',
    'rejected': 'Rejected',
    'hangup': 'Hung Up',
    'voicemail': 'Voicemail',
  };
  
  return stateMap[state.toLowerCase()] || state;
};

export const formatDate = (date) => {
  if (!date) return 'N/A';
  
  const dateObj = typeof date === 'number' ? new Date(date) : new Date(date);
  
  if (isNaN(dateObj.getTime())) {
    return 'Invalid Date';
  }
  
  return dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString();
};

export const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};