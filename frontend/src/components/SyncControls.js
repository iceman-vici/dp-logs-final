import React, { useState, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import { format } from 'date-fns';
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';
import 'react-datepicker/dist/react-datepicker.css';
import '../styles/SyncControls.css';

const SyncControls = ({ onSync, onRefresh, loading }) => {
  const nyTz = 'America/New_York';
  
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

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncStatus(syncMode === 'quick' ? 'Quick sync (first 50 calls)...' : 'Downloading all calls (may take a few minutes)...');
    
    try {
      // Format dates as NY timezone ISO strings
      const fromIso = format(fromDate, "yyyy-MM-dd'T'HH:mm:ss");
      const toIso = format(toDate, "yyyy-MM-dd'T'HH:mm:ss");
      
      console.log('Syncing from:', fromIso, 'to:', toIso, '(NY Time)');
      console.log('Sync mode:', syncMode);
      
      const result = await onSync(fromIso, toIso, syncMode);
      
      if (result.hasMore && syncMode === 'quick') {
        setSyncStatus(result.message + ' - More calls available. Use "Full Sync" to get all.');
      } else {
        setSyncStatus(result.message || 'Sync completed');
      }
    } catch (err) {
      setSyncStatus(`Sync failed: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleQuickDateRange = (days) => {
    const nyNow = getNYTime();
    const nyFrom = getNYTime();
    nyFrom.setDate(nyFrom.getDate() - days);
    
    setFromDate(nyFrom);
    setToDate(nyNow);
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
          />
          <span className="timezone-label">NY Time</span>
        </div>
        
        <div className="quick-select">
          <button onClick={() => handleQuickDateRange(1)}>Last 24h</button>
          <button onClick={() => handleQuickDateRange(7)}>Last 7d</button>
          <button onClick={() => handleQuickDateRange(30)}>Last 30d</button>
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
          disabled={loading}
          className="btn-secondary"
        >
          Refresh Tables
        </button>
      </div>

      {syncStatus && (
        <div className={`sync-status ${syncStatus.includes('failed') ? 'error' : 'success'}`}>
          {syncStatus}
        </div>
      )}
      
      <div className="timezone-info">
        <small>All times are in New York timezone (America/New_York)</small>
      </div>
    </div>
  );
};

export default SyncControls;