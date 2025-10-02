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

  // Display dates in NY timezone format
  const formatNYDate = (date) => {
    if (!date) return '';
    const nyDate = utcToZonedTime(date, nyTz);
    return format(nyDate, "MM/dd/yyyy, h:mm aa") + ' (NY)';
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncStatus('Downloading calls...');
    
    try {
      // Format dates as NY timezone ISO strings
      const fromIso = format(fromDate, "yyyy-MM-dd'T'HH:mm:ss");
      const toIso = format(toDate, "yyyy-MM-dd'T'HH:mm:ss");
      
      console.log('Syncing from:', fromIso, 'to:', toIso, '(NY Time)');
      
      const result = await onSync(fromIso, toIso);
      setSyncStatus(result.message || 'Sync completed');
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

      <div className="action-controls">
        <button 
          onClick={handleSync} 
          disabled={loading || isSyncing}
          className="btn-primary"
        >
          {isSyncing ? 'Syncing...' : 'Download & Insert Calls'}
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
