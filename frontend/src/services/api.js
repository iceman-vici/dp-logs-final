import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 600000, // Increased to 10 minutes for very large sync operations
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

  downloadCalls: async (from, to, limit = 50) => {
    // Use longer timeout for download operations
    const response = await api.get('/sync/download', {
      params: { from, to, limit },
      timeout: 600000 // 10 minutes timeout for full sync with many pages
    });
    return response.data;
  },

  // New method for quick sync (single page)
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