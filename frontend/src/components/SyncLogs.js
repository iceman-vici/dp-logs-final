import React, { useState, useEffect } from 'react';
import { callsApi } from '../services/api';
import '../styles/SyncLogs.css';

const SyncLogs = () => {
  const [syncLogs, setSyncLogs] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const [logDetails, setLogDetails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchSyncLogs();
  }, []);

  const fetchSyncLogs = async () => {
    try {
      setLoading(true);
      const response = await callsApi.getSyncLogs();
      setSyncLogs(response);
    } catch (error) {
      console.error('Failed to fetch sync logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogDetails = async (syncId) => {
    try {
      setLoading(true);
      const response = await callsApi.getSyncLogDetails(syncId, filter === 'all' ? null : filter);
      setLogDetails(response);
    } catch (error) {
      console.error('Failed to fetch log details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogClick = (log) => {
    setSelectedLog(log);
    fetchLogDetails(log.sync_id);
  };

  const handleRetry = async (syncId) => {
    try {
      setLoading(true);
      const response = await callsApi.retrySyncFailed(syncId);
      alert(`Retry completed: ${response.successCount} succeeded, ${response.stillFailedCount} still failed`);
      fetchSyncLogs();
      if (selectedLog?.sync_id === syncId) {
        fetchLogDetails(syncId);
      }
    } catch (error) {
      console.error('Retry failed:', error);
      alert('Failed to retry sync');
    } finally {
      setLoading(false);
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
        <button onClick={fetchSyncLogs} className="btn-refresh" disabled={loading}>
          🔄 Refresh
        </button>
      </div>

      <div className="sync-logs-content">
        <div className="logs-list">
          <h3>Sync Operations</h3>
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
                    className={selectedLog?.sync_id === log.sync_id ? 'selected' : ''}
                  >
                    <td>
                      <span className={`status-badge ${log.status}`}>
                        {getStatusBadge(log.status)} {log.status}
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
                    <td>{log.total_calls || 0}</td>
                    <td>
                      <span className="success-count">{log.inserted_count || 0}</span>
                      /
                      <span className="failed-count">{log.failed_count || 0}</span>
                    </td>
                    <td>{formatDuration(log.duration_seconds)}</td>
                    <td>
                      {log.failed_count > 0 && (
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
            <h3>Sync Details: {selectedLog.sync_id}</h3>
            <div className="details-header">
              <select 
                value={filter} 
                onChange={(e) => {
                  setFilter(e.target.value);
                  fetchLogDetails(selectedLog.sync_id);
                }}
                className="filter-select"
              >
                <option value="all">All</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
                <option value="retry_pending">Retry Pending</option>
              </select>
              <span className="details-count">
                {logDetails.length} records
              </span>
            </div>
            
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
                  {logDetails.map(detail => (
                    <tr key={detail.id} className={`detail-${detail.status}`}>
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