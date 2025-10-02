import React, { useState, useEffect, useRef } from 'react';
import DatePicker from 'react-datepicker';
import { format } from 'date-fns';
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';
import 'react-datepicker/dist/react-datepicker.css';
import '../styles/SyncControls.css';

const SyncControls = ({ onSync, onRefresh, loading }) => {
  const nyTz = 'America/New_York';
  const logContainerRef = useRef(null);
  
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

  // Auto-scroll logs to bottom when new logs are added
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [syncLogs]);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setSyncLogs(prev => [...prev, { timestamp, message, type }]);
  };

  const clearLogs = () => {
    setSyncLogs([]);
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setShowLogs(true);
    clearLogs();
    
    const syncMessage = syncMode === 'quick' 
      ? 'Starting Quick Sync (first 50 calls)...' 
      : 'Starting Full Sync (all calls)...';
    
    setSyncStatus(syncMessage);
    addLog(syncMessage, 'info');
    
    try {
      // Format dates as NY timezone ISO strings
      const fromIso = format(fromDate, "yyyy-MM-dd'T'HH:mm:ss");
      const toIso = format(toDate, "yyyy-MM-dd'T'HH:mm:ss");
      
      addLog(`Date range: ${fromIso} to ${toIso} (NY Time)`, 'info');
      addLog(`Sync mode: ${syncMode.toUpperCase()}`, 'info');
      addLog('Connecting to Dialpad API...', 'info');
      
      // Create a wrapper function that handles progress updates
      const syncWithProgress = async (from, to, mode) => {
        // Simulate progress updates (in real implementation, these would come from the backend)
        const progressInterval = setInterval(() => {
          if (mode === 'full') {
            addLog('Fetching next page of calls...', 'progress');
          }
        }, 3000);
        
        try {
          const result = await onSync(from, to, mode);
          clearInterval(progressInterval);
          return result;
        } catch (error) {
          clearInterval(progressInterval);
          throw error;
        }
      };
      
      addLog('Fetching calls from Dialpad...', 'progress');
      const result = await syncWithProgress(fromIso, toIso, syncMode);
      
      // Log results
      addLog(`✓ Sync completed successfully!`, 'success');
      if (result.totalCalls) {
        addLog(`Total calls found: ${result.totalCalls}`, 'success');
        addLog(`Calls inserted: ${result.inserted}`, 'success');
        if (result.failed > 0) {
          addLog(`Calls failed: ${result.failed}`, 'warning');
        }
      }
      
      if (result.hasMore && syncMode === 'quick') {
        addLog('ℹ More calls available. Use "Full Sync" to get all.', 'warning');
        setSyncStatus(result.message + ' - More calls available');
      } else {
        setSyncStatus(result.message || 'Sync completed');
      }
    } catch (err) {
      addLog(`✗ Sync failed: ${err.message}`, 'error');
      setSyncStatus(`Sync failed: ${err.message}`);
    } finally {
      setIsSyncing(false);
      addLog('Sync process ended.', 'info');
    }
  };

  const handleQuickDateRange = (days) => {
    const nyNow = getNYTime();
    const nyFrom = getNYTime();
    nyFrom.setDate(nyFrom.getDate() - days);
    
    setFromDate(nyFrom);
    setToDate(nyNow);
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
          <span>Quick Sync (First 50 calls - Fast)</span>
        </label>
        <label className="radio-label">
          <input
            type="radio"
            value="full"
            checked={syncMode === 'full'}
            onChange={(e) => setSyncMode(e.target.value)}
            disabled={isSyncing}
          />
          <span>Full Sync (All calls - May take time)</span>
        </label>
      </div>

      <div className="action-controls">
        <button 
          onClick={handleSync} 
          disabled={loading || isSyncing}
          className="btn-primary"
        >
          {isSyncing ? 'Syncing...' : (syncMode === 'quick' ? 'Quick Sync' : 'Full Sync')}
        </button>
        
        <button 
          onClick={onRefresh} 
          disabled={loading || isSyncing}
          className="btn-secondary"
        >
          Refresh Tables
        </button>
        
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
      
      {showLogs && syncLogs.length > 0 && (
        <div className="sync-logs-container">
          <div className="sync-logs-header">
            <span>Sync Progress Logs</span>
            {isSyncing && <span className="spinner-small"></span>}
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
      </div>
    </div>
  );
};

export default SyncControls;