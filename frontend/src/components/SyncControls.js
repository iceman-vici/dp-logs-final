import React, { useState, useEffect, useRef } from 'react';
import DatePicker from 'react-datepicker';
import { format } from 'date-fns';
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';
import { callsApi } from '../services/api';
import 'react-datepicker/dist/react-datepicker.css';
import '../styles/SyncControls.css';

const SyncControls = ({ onSync, onRefresh, loading }) => {
  const nyTz = 'America/New_York';
  const logContainerRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const eventSourceRef = useRef(null);
  
  // Initialize dates in NY timezone
  const getNYTime = (date = new Date()) => {
    return utcToZonedTime(date, nyTz);
  };
  
  // Initialize with NY timezone dates
  const [fromDate, setFromDate] = useState(() => {
    const nyNow = getNYTime();
    nyNow.setDate(nyNow.getDate() - 7); // 7 days ago in NY time
    return nyNow;
  });
  
  const [toDate, setToDate] = useState(() => getNYTime());
  const [syncStatus, setSyncStatus] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMode, setSyncMode] = useState('quick'); // 'quick' or 'full'
  const [syncLogs, setSyncLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [currentJobId, setCurrentJobId] = useState(null);
  const [syncProgress, setSyncProgress] = useState(null);

  // Auto-scroll logs to bottom when new logs are added
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [syncLogs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setSyncLogs(prev => [...prev, { timestamp, message, type }]);
  };

  const clearLogs = () => {
    setSyncLogs([]);
    setElapsedTime(0);
    setSyncProgress(null);
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setShowLogs(true);
    clearLogs();
    
    const startTime = Date.now();
    setElapsedTime(0);
    
    // Start elapsed time counter
    progressIntervalRef.current = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    
    const syncMessage = syncMode === 'quick' 
      ? 'Starting Quick Sync (first 50 calls)...' 
      : 'Starting Full Sync (background job)...';
    
    setSyncStatus(syncMessage);
    addLog(syncMessage, 'info');
    
    try {
      // Format dates as NY timezone ISO strings
      const fromIso = format(fromDate, "yyyy-MM-dd'T'HH:mm:ss");
      const toIso = format(toDate, "yyyy-MM-dd'T'HH:mm:ss");
      
      addLog(`Date range: ${fromIso} to ${toIso} (NY Time)`, 'info');
      addLog(`Sync mode: ${syncMode.toUpperCase()}`, 'info');
      
      if (syncMode === 'full') {
        addLog('✅ Background sync - process continues on server', 'success');
        addLog('📊 You can close this window and check progress later', 'info');
        addLog('🔄 Real-time updates via server-sent events', 'info');
      }
      
      addLog('Connecting to backend...', 'info');
      
      // Progress handler for updates
      const handleProgress = (data) => {
        setSyncProgress(data.progress);
        
        if (data.type === 'error') {
          addLog(`❌ ${data.message || 'Error occurred'}`, 'error');
        } else if (data.status === 'running') {
          const progress = data.progress || {};
          if (progress.message) {
            addLog(progress.message, 'progress');
          }
          if (progress.totalCalls) {
            addLog(`Progress: ${progress.insertedCount || 0}/${progress.totalCalls} calls processed`, 'info');
            if (progress.failedCount > 0) {
              addLog(`⚠️ ${progress.failedCount} calls failed`, 'warning');
            }
          }
        } else if (data.status === 'completed') {
          const result = data.result || {};
          addLog('🎉 Sync completed successfully!', 'success');
          addLog(`Total calls: ${result.totalCalls || 0}`, 'success');
          addLog(`Successfully inserted: ${result.insertedCount || 0}`, 'success');
          if (result.failedCount > 0) {
            addLog(`Failed insertions: ${result.failedCount}`, 'warning');
          }
          addLog(`Duration: ${result.duration || 0} seconds`, 'info');
          setSyncStatus('Sync completed');
        } else if (data.status === 'failed') {
          addLog(`❌ Sync failed: ${data.error || 'Unknown error'}`, 'error');
          setSyncStatus('Sync failed');
        }
      };
      
      const result = await onSync(fromIso, toIso, syncMode, handleProgress);
      
      if (syncMode === 'full' && result.jobId) {
        setCurrentJobId(result.jobId);
        addLog(`📋 Job ID: ${result.jobId}`, 'info');
        addLog('Monitoring sync progress...', 'progress');
        
        // Store event source reference
        if (result.eventSource) {
          eventSourceRef.current = result.eventSource;
        }
      } else if (syncMode === 'quick') {
        // Quick sync completed immediately
        addLog('✅ Quick sync completed!', 'success');
        if (result.totalCalls !== undefined) {
          addLog(`Total calls: ${result.totalCalls}`, 'success');
          addLog(`Inserted: ${result.inserted}`, 'success');
          if (result.failed > 0) {
            addLog(`Failed: ${result.failed}`, 'warning');
          }
        }
        if (result.hasMore) {
          addLog('ℹ️ More calls available. Use "Full Sync" to get all.', 'warning');
        }
        setSyncStatus(result.message || 'Quick sync completed');
      }
      
      return result;
    } catch (err) {
      const errorMessage = err.message || 'Unknown error';
      addLog(`❌ Sync failed: ${errorMessage}`, 'error');
      setSyncStatus(`Sync failed: ${errorMessage}`);
      throw err;
    } finally {
      setIsSyncing(false);
      
      // Clear elapsed time interval
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      
      addLog(`Sync process ended. Total time: ${elapsedTime} seconds`, 'info');
    }
  };

  const handleQuickDateRange = (days) => {
    const nyNow = getNYTime();
    const nyFrom = getNYTime();
    nyFrom.setDate(nyFrom.getDate() - days);
    
    setFromDate(nyFrom);
    setToDate(nyNow);
  };

  const checkJobStatus = async () => {
    if (!currentJobId) return;
    
    try {
      const status = await callsApi.getSyncStatus(currentJobId);
      setSyncProgress(status.progress);
      addLog(`Job ${currentJobId}: ${status.status}`, 'info');
      if (status.progress) {
        addLog(`Progress: ${status.progress.insertedCount || 0}/${status.progress.totalCalls || 0}`, 'progress');
      }
    } catch (error) {
      console.error('Failed to check job status:', error);
    }
  };

  const getLogClassName = (type) => {
    switch (type) {
      case 'error': return 'log-error';
      case 'warning': return 'log-warning';
      case 'success': return 'log-success';
      case 'progress': return 'log-progress';
      default: return 'log-info';
    }
  };

  const formatElapsedTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  return (
    <div className="sync-controls">
      <div className="date-controls">
        <div className="date-picker-group">
          <label>From:</label>
          <DatePicker
            selected={fromDate}
            onChange={setFromDate}
            showTimeSelect
            dateFormat="MM/dd/yyyy, h:mm aa"
            placeholderText="Select start date (NY)"
            className="date-input"
            timeIntervals={15}
            popperPlacement="bottom-start"
            disabled={isSyncing}
          />
          <span className="timezone-label">NY Time</span>
        </div>
        
        <div className="date-picker-group">
          <label>To:</label>
          <DatePicker
            selected={toDate}
            onChange={setToDate}
            showTimeSelect
            dateFormat="MM/dd/yyyy, h:mm aa"
            placeholderText="Select end date (NY)"
            className="date-input"
            timeIntervals={15}
            popperPlacement="bottom-start"
            disabled={isSyncing}
          />
          <span className="timezone-label">NY Time</span>
        </div>
        
        <div className="quick-select">
          <button onClick={() => handleQuickDateRange(1)} disabled={isSyncing}>Last 24h</button>
          <button onClick={() => handleQuickDateRange(7)} disabled={isSyncing}>Last 7d</button>
          <button onClick={() => handleQuickDateRange(30)} disabled={isSyncing}>Last 30d</button>
        </div>
      </div>

      <div className="sync-mode-selector">
        <label className="radio-label">
          <input
            type="radio"
            value="quick"
            checked={syncMode === 'quick'}
            onChange={(e) => setSyncMode(e.target.value)}
            disabled={isSyncing}
          />
          <span>Quick Sync (First 50 calls - Immediate)</span>
        </label>
        <label className="radio-label">
          <input
            type="radio"
            value="full"
            checked={syncMode === 'full'}
            onChange={(e) => setSyncMode(e.target.value)}
            disabled={isSyncing}
          />
          <span>Full Sync (All calls - Background Job)</span>
        </label>
      </div>

      <div className="sync-info">
        <div className="info-item">
          <span className="info-icon">🚀</span>
          <span><strong>Quick Sync:</strong> Immediate, first 50 calls, blocks UI</span>
        </div>
        <div className="info-item">
          <span className="info-icon">🔧</span>
          <span><strong>Full Sync:</strong> Background job, all calls, non-blocking</span>
        </div>
      </div>

      <div className="action-controls">
        <button 
          onClick={handleSync} 
          disabled={loading || isSyncing}
          className="btn-primary"
        >
          {isSyncing ? `Syncing... (${formatElapsedTime(elapsedTime)})` : (syncMode === 'quick' ? 'Quick Sync' : 'Start Background Sync')}
        </button>
        
        <button 
          onClick={onRefresh} 
          disabled={loading || isSyncing}
          className="btn-secondary"
        >
          Refresh Tables
        </button>
        
        {currentJobId && (
          <button 
            onClick={checkJobStatus}
            className="btn-secondary"
            disabled={isSyncing}
          >
            Check Job Status
          </button>
        )}
        
        {syncLogs.length > 0 && (
          <button 
            onClick={() => setShowLogs(!showLogs)}
            className="btn-secondary"
          >
            {showLogs ? 'Hide Logs' : 'Show Logs'}
          </button>
        )}
        
        {syncLogs.length > 0 && !isSyncing && (
          <button 
            onClick={clearLogs}
            className="btn-secondary"
          >
            Clear Logs
          </button>
        )}
      </div>

      {syncStatus && (
        <div className={`sync-status ${syncStatus.includes('failed') ? 'error' : 'success'}`}>
          {syncStatus}
        </div>
      )}
      
      {syncProgress && (
        <div className="sync-progress-bar">
          <div className="progress-info">
            <span>Pages: {syncProgress.pageCount || 0}</span>
            <span>Calls: {syncProgress.totalCalls || 0}</span>
            <span>Inserted: {syncProgress.insertedCount || 0}</span>
            <span>Failed: {syncProgress.failedCount || 0}</span>
          </div>
          {syncProgress.totalCalls > 0 && (
            <div className="progress-bar">
              <div 
                className="progress-fill"
                style={{ width: `${(syncProgress.insertedCount / syncProgress.totalCalls) * 100}%` }}
              ></div>
            </div>
          )}
        </div>
      )}
      
      {showLogs && syncLogs.length > 0 && (
        <div className="sync-logs-container">
          <div className="sync-logs-header">
            <span>Sync Progress Logs</span>
            {isSyncing && (
              <span className="elapsed-time">
                Elapsed: {formatElapsedTime(elapsedTime)}
                <span className="spinner-small"></span>
              </span>
            )}
          </div>
          <div className="sync-logs" ref={logContainerRef}>
            {syncLogs.map((log, index) => (
              <div key={index} className={`log-entry ${getLogClassName(log.type)}`}>
                <span className="log-timestamp">[{log.timestamp}]</span>
                <span className="log-message">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <div className="timezone-info">
        <small>All times are in New York timezone (America/New_York)</small>
        <br />
        <small className="rate-limit-info">Background sync runs server-side with automatic retry for failures</small>
      </div>
    </div>
  );
};

export default SyncControls;