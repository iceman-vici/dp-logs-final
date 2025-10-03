import React, { useState, useEffect, useCallback } from 'react';
import CallsTable from './components/CallsTable';
import UserStatsTable from './components/UserStatsTable';
import SyncControls from './components/SyncControls';
import SyncLogs from './components/SyncLogs';
import ScheduleManager from './components/ScheduleManager';
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
  const [activeView, setActiveView] = useState('dashboard'); // 'dashboard', 'sync-logs', 'schedules'

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

  const loadInitialData = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const handleSync = async (fromDate, toDate, syncMode = 'quick', onProgress) => {
    try {
      setLoading(true);
      
      let result;
      if (syncMode === 'quick') {
        // Quick sync uses regular HTTP request
        result = await callsApi.downloadCallsQuick(fromDate, toDate);
        toast.success(result.message || 'Quick sync completed');
        setLastSync(new Date());
        // Refresh data
        await Promise.all([
          fetchCalls(),
          fetchUserStats()
        ]);
      } else {
        // Full sync starts a background job
        result = await callsApi.startSync(fromDate, toDate, 'full');
        toast.info(`Sync job started: ${result.jobId}`);
        
        // Subscribe to progress updates
        if (result.jobId && onProgress) {
          const eventSource = callsApi.subscribeSyncProgress(result.jobId, (data) => {
            onProgress(data);
            
            if (data.status === 'completed') {
              toast.success('Sync completed successfully');
              setLastSync(new Date());
              // Refresh data
              fetchCalls();
              fetchUserStats();
            } else if (data.status === 'failed') {
              toast.error('Sync failed');
            }
          });
          
          // Store event source for cleanup if needed
          result.eventSource = eventSource;
        }
      }
      
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
        
        <div className="view-controls">
          <button 
            onClick={() => setActiveView('dashboard')}
            className={`btn-view ${activeView === 'dashboard' ? 'active' : ''}`}
          >
            📊 Dashboard
          </button>
          <button 
            onClick={() => setActiveView('sync-logs')}
            className={`btn-view ${activeView === 'sync-logs' ? 'active' : ''}`}
          >
            📋 Sync Logs
          </button>
          <button 
            onClick={() => setActiveView('schedules')}
            className={`btn-view ${activeView === 'schedules' ? 'active' : ''}`}
          >
            🗓️ Schedules
          </button>
        </div>
        
        {activeView === 'dashboard' && (
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
        )}
        
        {activeView === 'sync-logs' && <SyncLogs />}
        
        {activeView === 'schedules' && <ScheduleManager />}
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