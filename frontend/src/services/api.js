import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 60000, // Default 1 minute timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized access
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const callsApi = {
  getCalls: async (params = {}) => {
    const response = await api.get('/calls', { params });
    return response.data;
  },

  getCallById: async (id) => {
    const response = await api.get(`/calls/${id}`);
    return response.data;
  },

  getUserStats: async (limit = 10) => {
    const response = await api.get('/stats/users', { params: { limit } });
    return response.data;
  },

  getCallSummary: async () => {
    const response = await api.get('/stats/summary');
    return response.data;
  },

  // Start background sync job
  startSync: async (from, to, mode = 'full') => {
    const response = await api.post('/sync/start', { from, to, mode });
    return response.data;
  },

  // Get sync job status
  getSyncStatus: async (jobId) => {
    const response = await api.get(`/sync/status/${jobId}`);
    return response.data;
  },

  // Get sync logs history
  getSyncLogs: async (limit = 10, offset = 0) => {
    const response = await api.get('/sync/logs', { params: { limit, offset } });
    return response.data;
  },

  // Get sync log details
  getSyncLogDetails: async (syncId, status = null, limit = 100) => {
    const params = { limit };
    if (status) params.status = status;
    const response = await api.get(`/sync/logs/${syncId}/details`, { params });
    return response.data;
  },

  // Retry failed sync
  retrySyncFailed: async (syncId) => {
    const response = await api.post(`/sync/retry/${syncId}`);
    return response.data;
  },

  // Subscribe to sync progress (SSE)
  subscribeSyncProgress: (jobId, onProgress) => {
    const eventSource = new EventSource(`${API_URL}/sync/progress/${jobId}`);
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onProgress(data);
        
        if (data.status === 'completed' || data.status === 'failed') {
          eventSource.close();
        }
      } catch (error) {
        console.error('Error parsing progress:', error);
      }
    };
    
    eventSource.onerror = () => {
      eventSource.close();
    };
    
    return eventSource;
  },

  // Quick sync (single page)
  downloadCallsQuick: async (from, to) => {
    const response = await api.get('/sync/download-quick', {
      params: { from, to },
      timeout: 60000 // 1 minute timeout for quick sync
    });
    return response.data;
  },

  syncAllCalls: async () => {
    const response = await api.post('/sync/all');
    return response.data;
  },

  // Schedule management
  getSchedules: async () => {
    const response = await api.get('/schedule');
    return response.data;
  },

  createSchedule: async (data) => {
    const response = await api.post('/schedule', data);
    return response.data;
  },

  updateSchedule: async (id, data) => {
    const response = await api.put(`/schedule/${id}`, data);
    return response.data;
  },

  deleteSchedule: async (id) => {
    const response = await api.delete(`/schedule/${id}`);
    return response.data;
  },

  triggerSchedule: async (id) => {
    const response = await api.post(`/schedule/${id}/trigger`);
    return response.data;
  },

  validateCron: async (expression) => {
    const response = await api.post('/schedule/validate-cron', { expression });
    return response.data;
  },

  getSchedulePresets: async () => {
    const response = await api.get('/schedule/presets');
    return response.data;
  },
};

export default api;