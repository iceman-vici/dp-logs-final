import React, { useState } from 'react';
import DatePicker from 'react-datepicker';
import { format } from 'date-fns';
import { utcToZonedTime } from 'date-fns-tz';
import 'react-datepicker/dist/react-datepicker.css';
import '../styles/SyncControls.css';

const SyncControls = ({ onSync, onRefresh, loading }) => {
  const [fromDate, setFromDate] = useState(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const [toDate, setToDate] = useState(new Date());
  const [syncStatus, setSyncStatus] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncStatus('Downloading calls...');
    
    try {
      const nyTz = 'America/New_York';
      const zonedFrom = utcToZonedTime(fromDate, nyTz);
      const zonedTo = utcToZonedTime(toDate, nyTz);
      const fromIso = format(zonedFrom, "yyyy-MM-dd'T'HH:mm:ss");
      const toIso = format(zonedTo, "yyyy-MM-dd'T'HH:mm:ss");
      
      const result = await onSync(fromIso, toIso);
      setSyncStatus(result.message || 'Sync completed');
    } catch (err) {
      setSyncStatus(`Sync failed: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleQuickDateRange = (days) => {
    const now = new Date();
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    setFromDate(from);
    setToDate(now);
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
            dateFormat="Pp"
            placeholderText="Select start date (NY)"
            className="date-input"
          />
        </div>
        
        <div className="date-picker-group">
          <label>To:</label>
          <DatePicker
            selected={toDate}
            onChange={setToDate}
            showTimeSelect
            dateFormat="Pp"
            placeholderText="Select end date (NY)"
            className="date-input"
          />
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
    </div>
  );
};

export default SyncControls;
