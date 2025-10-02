import React, { createContext, useContext, useState, useEffect } from 'react';
import { callsApi } from '../services/api';

const AppContext = createContext();

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
};

export const AppProvider = ({ children }) => {
  const [calls, setCalls] = useState([]);
  const [userStats, setUserStats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    dateRange: { from: null, to: null },
    state: null,
    direction: null,
    user: null
  });

  const fetchCalls = async (params = {}) => {
    try {
      setLoading(true);
      const data = await callsApi.getCalls(params);
      setCalls(data);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const fetchUserStats = async (limit = 10) => {
    try {
      setLoading(true);
      const data = await callsApi.getUserStats(limit);
      setUserStats(data);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const syncCalls = async (from, to, limit) => {
    try {
      setLoading(true);
      const result = await callsApi.downloadCalls(from, to, limit);
      // Refresh data after sync
      await Promise.all([
        fetchCalls(),
        fetchUserStats()
      ]);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateFilters = (newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  const clearFilters = () => {
    setFilters({
      dateRange: { from: null, to: null },
      state: null,
      direction: null,
      user: null
    });
  };

  const value = {
    calls,
    userStats,
    loading,
    error,
    filters,
    fetchCalls,
    fetchUserStats,
    syncCalls,
    updateFilters,
    clearFilters,
    setCalls,
    setUserStats,
    setError
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};