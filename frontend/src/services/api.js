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

  // Streaming download for full sync
  downloadCallsStream: async (from, to, onProgress) => {
    return new Promise((resolve, reject) => {
      const eventSource = new EventSource(`${API_URL}/sync/download-stream?from=${from}&to=${to}`);
      let result = null;
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'complete') {
            result = data.result;
            eventSource.close();
            if (result.success) {
              resolve(result);
            } else {
              reject(new Error(result.error || 'Sync failed'));
            }
          } else if (onProgress) {
            onProgress(data);
          }
        } catch (error) {
          console.error('Error parsing SSE message:', error);
        }
      };
      
      eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        eventSource.close();
        reject(new Error('Connection lost during sync'));
      };
      
      // No timeout for SSE - it will continue until complete
    });
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
};

export default api;