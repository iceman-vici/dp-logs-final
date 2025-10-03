import React from 'react';
import { format } from 'date-fns';
import { utcToZonedTime } from 'date-fns-tz';
import '../styles/UserStatsTable.css';

const UserStatsTable = ({ stats, loading }) => {
  const nyTz = 'America/New_York';
  
  // Helper to format epoch timestamp to NY timezone
  const formatEpochToNY = (epochMs) => {
    if (!epochMs || epochMs === 'N/A') return 'N/A';
    
    try {
      // Convert epoch milliseconds to Date object
      const date = new Date(parseInt(epochMs));
      
      // Check if date is valid
      if (isNaN(date.getTime())) return 'N/A';
      
      // Convert to NY timezone
      const nyDate = utcToZonedTime(date, nyTz);
      
      // Format the date
      return format(nyDate, 'MM/dd/yyyy HH:mm:ss');
    } catch (error) {
      console.error('Date formatting error:', error);
      return 'N/A';
    }
  };
  
  // Helper to format duration
  const formatDuration = (seconds) => {
    if (!seconds || seconds === 0) return '0s';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${mins}m ${secs}s`;
    } else if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };
  
  // Helper to format average duration
  const formatAvgDuration = (seconds) => {
    if (!seconds || seconds === 0) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  };
  
  // Helper to calculate efficiency score
  const getEfficiencyScore = (stats) => {
    if (!stats.total_calls) return 0;
    const connectedRatio = (stats.connected_calls / stats.total_calls) * 100;
    return connectedRatio.toFixed(1);
  };
  
  // Helper to get efficiency badge color
  const getEfficiencyBadgeClass = (score) => {
    const numScore = parseFloat(score);
    if (numScore >= 80) return 'badge-excellent';
    if (numScore >= 60) return 'badge-good';
    if (numScore >= 40) return 'badge-fair';
    return 'badge-poor';
  };
  
  if (loading && (!stats || stats.length === 0)) {
    return <div className="loading">Loading user statistics...</div>;
  }
  
  if (!stats || stats.length === 0) {
    return <div className="no-data">No user statistics available</div>;
  }
  
  return (
    <div className="user-stats-container">
      <div className="stats-header">
        <h3>Top {stats.length} Users by Call Volume</h3>
      </div>
      <div className="stats-grid">
        {stats.map((user, index) => {
          const efficiency = getEfficiencyScore(user);
          const avgCallDuration = user.total_calls > 0 
            ? user.total_duration / user.total_calls 
            : 0;
          
          return (
            <div key={user.user_id || index} className="user-card">
              <div className="user-header">
                <div className="user-rank">#{index + 1}</div>
                <div className="user-info">
                  <h4>{user.user_name || 'Unknown User'}</h4>
                  <span className="user-email">{user.user_email || 'N/A'}</span>
                </div>
              </div>
              
              <div className="stats-metrics">
                <div className="metric">
                  <span className="metric-label">Total Calls</span>
                  <span className="metric-value primary">{user.total_calls || 0}</span>
                </div>
                
                <div className="metric">
                  <span className="metric-label">Connected</span>
                  <span className="metric-value success">{user.connected_calls || 0}</span>
                </div>
                
                <div className="metric">
                  <span className="metric-label">Missed</span>
                  <span className="metric-value error">{user.missed_calls || 0}</span>
                </div>
                
                <div className="metric">
                  <span className="metric-label">Voicemail</span>
                  <span className="metric-value warning">{user.voicemail_calls || 0}</span>
                </div>
              </div>
              
              <div className="stats-details">
                <div className="detail-row">
                  <span className="detail-label">📥 Inbound:</span>
                  <span className="detail-value">{user.inbound_calls || 0}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">📤 Outbound:</span>
                  <span className="detail-value">{user.outbound_calls || 0}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">⏱ Total Duration:</span>
                  <span className="detail-value">{formatDuration(user.total_duration)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">⏰ Avg Duration:</span>
                  <span className="detail-value">{formatAvgDuration(avgCallDuration)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">🎯 Efficiency:</span>
                  <span className={`badge ${getEfficiencyBadgeClass(efficiency)}`}>
                    {efficiency}%
                  </span>
                </div>
              </div>
              
              {user.last_call_date && (
                <div className="last-call">
                  <span className="last-call-label">Last Call:</span>
                  <span className="last-call-date">
                    {formatEpochToNY(user.last_call_date)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default UserStatsTable;