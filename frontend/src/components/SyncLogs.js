import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { callsApi } from '../services/api';
import '../styles/SyncLogs.css';

const SyncLogs = () => {
  const [syncLogs, setSyncLogs] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const [logDetails, setLogDetails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [isConnected, setIsConnected] = useState(false);
  const [statusCounts, setStatusCounts] = useState({});
  const socketRef = useRef(null);
  const watchedSyncRef = useRef(null);

  useEffect(() => {
    // Initialize WebSocket connection
    const socket = io('http://localhost:3001', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    // Connection events
    socket.on('connect', () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      socket.emit('join-sync-logs');
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
    });

    // Real-time sync logs updates
    socket.on('sync-logs-update', (logs) => {
      console.log('Received sync logs update:', logs.length);
      setSyncLogs(logs);
    });

    // New sync started
    socket.on('new-sync-started', (newSync) => {
      console.log('New sync started:', newSync.sync_id);
      setSyncLogs(prev => {
        // Check if sync already exists
        const exists = prev.some(log => log.sync_id === newSync.sync_id);
        if (exists) {
          return prev.map(log => log.sync_id === newSync.sync_id ? newSync : log);
        }
        return [newSync, ...prev].slice(0, 50); // Keep max 50 logs
      });
    });

    // Sync log updated
    socket.on('sync-log-updated', (updatedLog) => {
      console.log('Sync log updated:', updatedLog.sync_id, updatedLog.status);
      setSyncLogs(prev => prev.map(log => 
        log.sync_id === updatedLog.sync_id ? updatedLog : log
      ));
      
      // Update selected log if it's the one being updated
      if (selectedLog?.sync_id === updatedLog.sync_id) {
        setSelectedLog(updatedLog);
      }
    });

    // Sync update for watched sync
    socket.on('sync-update', (syncLog) => {
      console.log('Sync update:', syncLog.sync_id, syncLog.status);
      if (selectedLog?.sync_id === syncLog.sync_id) {
        setSelectedLog(syncLog);
      }
      
      // Update in the main list too
      setSyncLogs(prev => prev.map(log => 
        log.sync_id === syncLog.sync_id ? syncLog : log
      ));
    });

    // Sync progress update
    socket.on('sync-progress', (data) => {
      const { syncId, progress } = data;
      console.log('Sync progress:', syncId, progress);
      
      // Update the sync log with progress
      setSyncLogs(prev => prev.map(log => 
        log.sync_id === syncId ? { ...log, ...progress } : log
      ));
      
      if (selectedLog?.sync_id === syncId) {
        setSelectedLog(prev => ({ ...prev, ...progress }));
      }
    });

    // Sync details update
    socket.on('sync-details-update', (data) => {
      const { syncId, statusCounts: counts, recentDetails } = data;
      console.log('Sync details update:', syncId, counts);
      
      if (selectedLog?.sync_id === syncId) {
        // Update status counts
        const countsObj = counts.reduce((acc, item) => {
          acc[item.status] = parseInt(item.count);
          return acc;
        }, {});
        setStatusCounts(countsObj);
        
        // Update details based on filter
        if (filter === 'all') {
          setLogDetails(recentDetails);
        } else {
          setLogDetails(recentDetails.filter(d => d.status === filter));
        }
      }
    });

    // Sync completed
    socket.on('sync-completed', (data) => {
      const { syncLog, details } = data;
      console.log('Sync completed:', syncLog.sync_id);
      
      if (selectedLog?.sync_id === syncLog.sync_id) {
        setSelectedLog(syncLog);
        if (filter === 'all') {
          setLogDetails(details);
        } else {
          setLogDetails(details.filter(d => d.status === filter));
        }
      }
      
      // Update in the main list
      setSyncLogs(prev => prev.map(log => 
        log.sync_id === syncLog.sync_id ? syncLog : log
      ));
    });

    // Sync details response
    socket.on('sync-details', (data) => {
      const { syncId, details } = data;
      if (selectedLog?.sync_id === syncId) {
        setLogDetails(details);
      }
    });

    // Error handling
    socket.on('sync-error', (error) => {
      console.error('WebSocket error:', error);
    });

    return () => {
      // Cleanup
      if (watchedSyncRef.current) {
        socket.emit('unwatch-sync', watchedSyncRef.current);
      }
      socket.emit('leave-sync-logs');
      socket.disconnect();
    };
  }, []); // Remove dependencies to avoid reconnection issues

  // Update selected log handler
  useEffect(() => {
    if (selectedLog && socketRef.current && socketRef.current.connected) {
      // Request details update when filter changes
      socketRef.current.emit('get-sync-details', {
        syncId: selectedLog.sync_id,
        status: filter === 'all' ? null : filter,
        limit: 100
      });
    }
  }, [filter, selectedLog]);

  const handleLogClick = (log) => {
    // Unwatch previous sync
    if (watchedSyncRef.current && socketRef.current) {
      socketRef.current.emit('unwatch-sync', watchedSyncRef.current);
    }
    
    setSelectedLog(log);
    watchedSyncRef.current = log.sync_id;
    setStatusCounts({});
    
    // Watch new sync for real-time updates
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('watch-sync', log.sync_id);
      socketRef.current.emit('get-sync-details', {
        syncId: log.sync_id,
        status: filter === 'all' ? null : filter,
        limit: 100
      });
    }
  };

  const handleFilterChange = (newFilter) => {
    setFilter(newFilter);
  };

  const handleRetry = async (syncId) => {
    try {
      setLoading(true);
      const response = await callsApi.retrySyncFailed(syncId);
      alert(`Retry completed: ${response.successCount} succeeded, ${response.stillFailedCount} still failed`);
      
      // Request refresh via WebSocket
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('refresh-sync-logs');
        if (selectedLog?.sync_id === syncId) {
          socketRef.current.emit('get-sync-details', {
            syncId: syncId,
            status: filter === 'all' ? null : filter,
            limit: 100
          });
        }
      }
    } catch (error) {
      console.error('Retry failed:', error);
      alert('Failed to retry sync');
    } finally {
      setLoading(false);
    }
  };

  const refreshLogs = () => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('refresh-sync-logs');
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      'completed': '✅',
      'partial': '⚠️',
      'failed': '❌',
      'in_progress': '🔄',
      'success': '✓',
      'retry_pending': '🔄'
    };
    return badges[status] || '❓';
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  return (
    <div className="sync-logs-container">
      <div className="sync-logs-header">
        <h2>Sync History & Logs</h2>
        <div className="header-controls">
          <span className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '🟢 Live' : '🔴 Disconnected'}
          </span>
          <button onClick={refreshLogs} className="btn-refresh" disabled={loading || !isConnected}>
            🔄 Refresh
          </button>
        </div>
      </div>

      <div className="sync-logs-content">
        <div className="logs-list">
          <h3>Sync Operations {isConnected && <span className="live-indicator">● LIVE</span>}</h3>
          <div className="logs-table">
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Date Range</th>
                  <th>Mode</th>
                  <th>Calls</th>
                  <th>Success/Failed</th>
                  <th>Duration</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {syncLogs.map(log => (
                  <tr 
                    key={log.sync_id} 
                    onClick={() => handleLogClick(log)}
                    className={`${selectedLog?.sync_id === log.sync_id ? 'selected' : ''} ${log.status === 'in_progress' ? 'syncing' : ''}`}
                  >
                    <td>
                      <span className={`status-badge ${log.status}`}>
                        {getStatusBadge(log.status)} {log.status}
                        {log.status === 'in_progress' && <span className="pulse"></span>}
                      </span>
                    </td>
                    <td>
                      <div className="date-range">
                        <small>{log.date_from_ny}</small>
                        <br />
                        <small>{log.date_to_ny}</small>
                      </div>
                    </td>
                    <td>{log.sync_mode}</td>
                    <td>
                      {log.total_calls || 0}
                      {log.status === 'in_progress' && log.total_pages > 0 && (
                        <small className="page-info"> (p{log.total_pages})</small>
                      )}
                    </td>
                    <td>
                      <span className="success-count">{log.inserted_count || 0}</span>
                      /
                      <span className="failed-count">{log.failed_count || 0}</span>
                    </td>
                    <td>{formatDuration(log.duration_seconds)}</td>
                    <td>
                      {log.failed_count > 0 && log.status !== 'in_progress' && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRetry(log.sync_id);
                          }}
                          className="btn-retry"
                          disabled={loading}
                        >
                          🔄 Retry Failed
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {selectedLog && (
          <div className="log-details">
            <h3>
              Sync Details: {selectedLog.sync_id.substring(0, 8)}...
              {selectedLog.status === 'in_progress' && (
                <span className="live-badge">🔄 LIVE UPDATES</span>
              )}
            </h3>
            <div className="details-header">
              <select 
                value={filter} 
                onChange={(e) => handleFilterChange(e.target.value)}
                className="filter-select"
              >
                <option value="all">All {statusCounts.all ? `(${Object.values(statusCounts).reduce((a, b) => a + b, 0)})` : ''}</option>
                <option value="success">Success {statusCounts.success ? `(${statusCounts.success})` : ''}</option>
                <option value="failed">Failed {statusCounts.failed ? `(${statusCounts.failed})` : ''}</option>
                <option value="retry_pending">Retry Pending {statusCounts.retry_pending ? `(${statusCounts.retry_pending})` : ''}</option>
              </select>
              <span className="details-count">
                {logDetails.length} records shown
                {selectedLog.status === 'in_progress' && ' (live updating...)'}
              </span>
            </div>
            
            {selectedLog.status === 'in_progress' && (
              <div className="progress-bar-container">
                <div className="progress-bar">
                  <div 
                    className="progress-fill animated"
                    style={{ 
                      width: `${(selectedLog.inserted_count / (selectedLog.total_calls || 1)) * 100}%` 
                    }}
                  ></div>
                </div>
                <div className="progress-text">
                  🏃 Processing: {selectedLog.inserted_count || 0} / {selectedLog.total_calls || 0} calls
                  {selectedLog.total_pages > 0 && ` (Page ${selectedLog.total_pages})`}
                </div>
              </div>
            )}
            
            <div className="details-table">
              <table>
                <thead>
                  <tr>
                    <th>Call ID</th>
                    <th>Page</th>
                    <th>Status</th>
                    <th>Retries</th>
                    <th>Error</th>
                    <th>Processed At</th>
                  </tr>
                </thead>
                <tbody>
                  {logDetails.map((detail, index) => (
                    <tr key={detail.id || index} className={`detail-${detail.status} ${index === 0 && selectedLog.status === 'in_progress' ? 'newest' : ''}`}>
                      <td>{detail.call_id}</td>
                      <td>{detail.page_number}</td>
                      <td>
                        <span className={`status-badge ${detail.status}`}>
                          {getStatusBadge(detail.status)} {detail.status}
                        </span>
                      </td>
                      <td>{detail.retry_count}</td>
                      <td className="error-cell">
                        {detail.error_message && (
                          <span title={detail.error_message}>
                            {detail.error_message.substring(0, 50)}...
                          </span>
                        )}
                      </td>
                      <td>{new Date(detail.processed_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {loading && (
        <div className="loading-overlay">
          <div className="spinner"></div>
        </div>
      )}
    </div>
  );
};

export default SyncLogs;