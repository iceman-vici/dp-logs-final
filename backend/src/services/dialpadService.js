const axios = require('axios');
const { format, parseISO, addDays, startOfDay, endOfDay } = require('date-fns');
const { utcToZonedTime, zonedTimeToUtc } = require('date-fns-tz');

// Initialize axios instance with Dialpad API configuration
const dialpadApi = axios.create({
  baseURL: 'https://dialpad.com/api/v2',
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.DIALPAD_API_KEY}`
  },
  timeout: 30000 // 30 seconds timeout
});

// Add request interceptor for logging
dialpadApi.interceptors.request.use(
  config => {
    console.log(`[Dialpad API] ${config.method.toUpperCase()} ${config.url}`);
    return config;
  },
  error => {
    console.error('[Dialpad API] Request error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for error handling
dialpadApi.interceptors.response.use(
  response => {
    console.log(`[Dialpad API] Response: ${response.status}`);
    return response;
  },
  error => {
    if (error.response) {
      console.error(`[Dialpad API] Error ${error.response.status}:`, error.response.data);
      
      // Handle rate limiting
      if (error.response.status === 429) {
        const retryAfter = error.response.headers['retry-after'] || 60;
        console.log(`[Dialpad API] Rate limited. Retry after ${retryAfter} seconds`);
        error.retryAfter = parseInt(retryAfter) * 1000;
      }
    } else if (error.request) {
      console.error('[Dialpad API] No response received:', error.message);
    } else {
      console.error('[Dialpad API] Error:', error.message);
    }
    return Promise.reject(error);
  }
);

// Sleep function for rate limiting
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class DialpadService {
  constructor() {
    this.apiCallCount = 0;
    this.rateLimitDelay = 1000; // 1 second between API calls by default
  }

  // Test API connection
  async testConnection() {
    try {
      const response = await dialpadApi.get('/users/me');
      return {
        success: true,
        user: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Fetch calls with pagination
  async fetchCalls(from, to, cursor = null, limit = 50) {
    try {
      // Convert dates to Unix timestamps (Dialpad expects seconds)
      const fromTimestamp = Math.floor(new Date(from).getTime() / 1000);
      const toTimestamp = Math.floor(new Date(to).getTime() / 1000);
      
      const params = {
        start_time: fromTimestamp,
        end_time: toTimestamp,
        limit: limit
      };
      
      if (cursor) {
        params.cursor = cursor;
      }
      
      console.log(`[Dialpad] Fetching calls from ${from} to ${to}, cursor: ${cursor || 'start'}`);
      
      // Add delay for rate limiting
      if (this.apiCallCount > 0) {
        await sleep(this.rateLimitDelay);
      }
      this.apiCallCount++;
      
      const response = await dialpadApi.get('/stats/calls', { params });
      
      return {
        calls: response.data.items || [],
        cursor: response.data.cursor,
        hasMore: response.data.cursor ? true : false,
        total: response.data.total || response.data.items?.length || 0
      };
    } catch (error) {
      // Handle rate limiting
      if (error.retryAfter) {
        console.log(`[Dialpad] Rate limited, waiting ${error.retryAfter}ms before retry`);
        await sleep(error.retryAfter);
        return this.fetchCalls(from, to, cursor, limit); // Retry
      }
      
      throw error;
    }
  }

  // Fetch all calls for a date range (handles pagination)
  async fetchAllCalls(from, to, onProgress = null) {
    const allCalls = [];
    let cursor = null;
    let page = 1;
    let totalFetched = 0;
    
    do {
      try {
        const result = await this.fetchCalls(from, to, cursor);
        
        if (result.calls.length > 0) {
          allCalls.push(...result.calls);
          totalFetched += result.calls.length;
        }
        
        cursor = result.cursor;
        
        // Report progress
        if (onProgress) {
          onProgress({
            page,
            fetched: totalFetched,
            hasMore: result.hasMore
          });
        }
        
        console.log(`[Dialpad] Page ${page}: Fetched ${result.calls.length} calls, Total: ${totalFetched}`);
        
        page++;
        
        // Safety check to prevent infinite loops
        if (page > 100) {
          console.warn('[Dialpad] Reached maximum page limit (100)');
          break;
        }
      } catch (error) {
        console.error(`[Dialpad] Error on page ${page}:`, error.message);
        throw error;
      }
    } while (cursor);
    
    console.log(`[Dialpad] Completed: Fetched ${totalFetched} total calls`);
    return allCalls;
  }

  // Transform Dialpad call to our format
  transformCall(call) {
    try {
      // Parse timestamps (Dialpad provides milliseconds)
      const parseTimestamp = (ts) => {
        if (!ts) return null;
        // Handle both seconds and milliseconds
        const timestamp = ts > 9999999999 ? ts : ts * 1000;
        return new Date(timestamp).toISOString();
      };
      
      // Convert NY time strings to timestamps if needed
      const parseNYTime = (timeStr) => {
        if (!timeStr) return null;
        try {
          // If it's already an ISO string, return it
          if (timeStr.includes('T')) return timeStr;
          
          // Parse NY time string and convert to UTC
          const nyDate = parseISO(timeStr + ' America/New_York');
          return nyDate.toISOString();
        } catch (e) {
          return null;
        }
      };
      
      return {
        call_id: call.id || call.call_id,
        date_started: parseTimestamp(call.date_started || call.start_time),
        date_rang: parseTimestamp(call.date_rang || call.ring_time),
        date_connected: parseTimestamp(call.date_connected || call.connect_time),
        date_ended: parseTimestamp(call.date_ended || call.end_time),
        // Store NY times as separate fields
        date_from_ny: call.date_from_ny || format(new Date(parseTimestamp(call.date_started || call.start_time)), 'yyyy-MM-dd HH:mm:ss'),
        date_to_ny: call.date_to_ny || format(new Date(parseTimestamp(call.date_ended || call.end_time)), 'yyyy-MM-dd HH:mm:ss'),
        
        // Call details
        direction: call.direction?.toLowerCase() || 'unknown',
        duration: call.duration || 0,
        state: call.state?.toLowerCase() || call.disposition?.toLowerCase() || 'unknown',
        
        // Numbers and contacts
        external_number: call.external_number || call.remote_number || '',
        internal_number: call.internal_number || call.local_number || '',
        contact_name: call.contact_name || call.remote_name || null,
        contact_phone: call.contact_phone || call.external_number || '',
        
        // Target (Dialpad user)
        target: call.target || call.user || '',
        target_name: call.target_name || call.user_name || '',
        target_email: call.target_email || call.user_email || '',
        
        // Recording and transcription
        was_recorded: call.was_recorded || call.recorded || false,
        recording_id: call.recording_id || call.recording?.id || null, // Extract recording_id
        voicemail_link: call.voicemail_link || call.voicemail_url || null,
        transcription_text: call.transcription_text || call.transcription || null,
        
        // Additional fields
        is_transferred: call.is_transferred || false,
        total_duration: call.total_duration || call.duration || 0,
        
        // IDs
        group_id: call.group_id || null,
        entry_point_call_id: call.entry_point_call_id || null,
        master_call_id: call.master_call_id || null,
        
        // Quality metrics
        mos_score: call.mos_score || null,
        
        // Event timestamp for sync tracking
        event_timestamp: parseTimestamp(call.event_timestamp || call.updated_at || call.date_ended || call.end_time)
      };
    } catch (error) {
      console.error('[Dialpad] Error transforming call:', error);
      console.error('Call data:', JSON.stringify(call, null, 2));
      throw error;
    }
  }

  // Fetch recording details by recording_id
  async fetchRecording(recordingId) {
    if (!recordingId) return null;
    
    try {
      console.log(`[Dialpad] Fetching recording: ${recordingId}`);
      
      // Add delay for rate limiting
      if (this.apiCallCount > 0) {
        await sleep(this.rateLimitDelay);
      }
      this.apiCallCount++;
      
      const response = await dialpadApi.get(`/recordings/${recordingId}`);
      
      return {
        id: response.data.id,
        url: response.data.url,
        duration: response.data.duration,
        size: response.data.size,
        format: response.data.format || 'mp3',
        created_at: response.data.created_at
      };
    } catch (error) {
      console.error(`[Dialpad] Error fetching recording ${recordingId}:`, error.message);
      
      // Handle rate limiting
      if (error.retryAfter) {
        console.log(`[Dialpad] Rate limited, waiting ${error.retryAfter}ms before retry`);
        await sleep(error.retryAfter);
        return this.fetchRecording(recordingId); // Retry
      }
      
      // Return null if recording not found
      if (error.response?.status === 404) {
        return null;
      }
      
      throw error;
    }
  }

  // Fetch recording URL for download
  async getRecordingUrl(recordingId) {
    if (!recordingId) return null;
    
    try {
      const recording = await this.fetchRecording(recordingId);
      return recording?.url || null;
    } catch (error) {
      console.error(`[Dialpad] Error getting recording URL for ${recordingId}:`, error.message);
      return null;
    }
  }

  // Batch fetch recordings for multiple calls
  async fetchRecordingsForCalls(calls, onProgress = null) {
    const recordings = {};
    let processed = 0;
    
    for (const call of calls) {
      if (call.recording_id) {
        try {
          const recording = await this.fetchRecording(call.recording_id);
          if (recording) {
            recordings[call.call_id] = recording;
          }
        } catch (error) {
          console.error(`[Dialpad] Error fetching recording for call ${call.call_id}:`, error.message);
        }
        
        processed++;
        if (onProgress) {
          onProgress({
            processed,
            total: calls.length,
            percentage: Math.round((processed / calls.length) * 100)
          });
        }
      }
    }
    
    return recordings;
  }
  
  // Validate date range
  validateDateRange(from, to) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new Error('Invalid date format');
    }
    
    if (fromDate > toDate) {
      throw new Error('From date must be before to date');
    }
    
    // Check if date range is too large (more than 31 days)
    const daysDiff = Math.ceil((toDate - fromDate) / (1000 * 60 * 60 * 24));
    if (daysDiff > 31) {
      console.warn(`[Dialpad] Large date range: ${daysDiff} days`);
    }
    
    return { fromDate, toDate, daysDiff };
  }
}

module.exports = new DialpadService();