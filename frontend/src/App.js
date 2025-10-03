import React, { useState, useEffect } from 'react';
import CallsTable from './components/CallsTable';
import UserStatsTable from './components/UserStatsTable';
import SyncControls from './components/SyncControls';
import LoadingSpinner from './components/LoadingSpinner';
import ErrorMessage from './components/ErrorMessage';
import { callsApi } from './services/api';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './styles/App.css';

function App() {
  const [calls, setCalls] = useState([]);
  const [userStats, setUserStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastSync, setLastSync] = useState(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      setError(null);
      await Promise.all([
        fetchCalls(),
        fetchUserStats()
      ]);
    } catch (err) {
      setError('Failed to load initial data');
      toast.error('Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchCalls = async () => {
    try {
      const data = await callsApi.getCalls();
      setCalls(data);
    } catch (err) {
      console.error('Failed to fetch calls:', err);
      throw err;
    }
  };

  const fetchUserStats = async () => {
    try {
      const data = await callsApi.getUserStats();
      setUserStats(data);
    } catch (err) {
      console.error('Failed to fetch user stats:', err);
      throw err;
    }
  };

  const handleSync = async (fromDate, toDate, syncMode = 'quick', onProgress) => {
    try {
      setLoading(true);
      
      let result;
      if (syncMode === 'quick') {
        // Quick sync uses regular HTTP request
        result = await callsApi.downloadCallsQuick(fromDate, toDate);
      } else {
        // Full sync uses SSE streaming
        result = await callsApi.downloadCallsStream(fromDate, toDate, onProgress);
      }
      
      toast.success(result.message || 'Sync completed successfully');
      setLastSync(new Date());
      
      // Refresh data after sync
      await Promise.all([
        fetchCalls(),
        fetchUserStats()
      ]);
      
      return result;
    } catch (err) {
      toast.error('Sync failed. Please check your settings and try again.');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    toast.info('Refreshing data...');
    await loadInitialData();
    toast.success('Data refreshed successfully');
  };

  if (loading && calls.length === 0) {
    return <LoadingSpinner message="Loading Dialpad Logs..." />;
  }

  return (
    <div className="App">
      <header className="app-header">
        <h1>Dialpad Calls Log System</h1>
        {lastSync && (
          <p className="last-sync">
            Last sync: {lastSync.toLocaleString()}
          </p>
        )}
      </header>

      <main className="app-main">
        {error && <ErrorMessage message={error} onRetry={loadInitialData} />}
        
        <SyncControls 
          onSync={handleSync} 
          onRefresh={handleRefresh}
          loading={loading}
        />
        
        <div className="dashboard-grid">
          <section className="calls-section">
            <h2>Recent Calls</h2>
            <CallsTable calls={calls} loading={loading} />
          </section>
          
          <section className="stats-section">
            <h2>User Call Statistics</h2>
            <UserStatsTable stats={userStats} loading={loading} />
          </section>
        </div>
      </main>

      <ToastContainer 
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
    </div>
  );
}

export default App;