import React, { useState } from 'react';
import { format } from 'date-fns';
import { utcToZonedTime } from 'date-fns-tz';
import { callsApi } from '../services/api';
import '../styles/CallsTable.css';

const CallsTable = ({ calls, loading }) => {
  const [expandedCall, setExpandedCall] = useState(null);
  const [recordingUrls, setRecordingUrls] = useState({});
  const [loadingRecording, setLoadingRecording] = useState({});
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
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  // Helper to get call direction icon
  const getDirectionIcon = (direction) => {
    switch (direction) {
      case 'inbound':
        return '📥';
      case 'outbound':
        return '📤';
      default:
        return '📞';
    }
  };

  // Helper to get state badge color
  const getStateBadgeClass = (state) => {
    switch (state) {
      case 'connected':
      case 'completed':
        return 'badge-success';
      case 'missed':
      case 'failed':
        return 'badge-error';
      case 'voicemail':
        return 'badge-warning';
      default:
        return 'badge-default';
    }
  };

  const toggleExpand = async (callId) => {
    if (expandedCall === callId) {
      setExpandedCall(null);
    } else {
      setExpandedCall(callId);
      
      // Fetch recording URL if available and not already fetched
      const call = calls.find(c => c.call_id === callId);
      if ((call.recording_id || call.voicemail_link) && !recordingUrls[callId]) {
        await fetchRecordingUrl(callId);
      }
    }
  };

  const fetchRecordingUrl = async (callId) => {
    try {
      setLoadingRecording(prev => ({ ...prev, [callId]: true }));
      const response = await callsApi.getCallRecording(callId);
      setRecordingUrls(prev => ({ ...prev, [callId]: response }));
    } catch (error) {
      console.error('Failed to fetch recording:', error);
      setRecordingUrls(prev => ({ 
        ...prev, 
        [callId]: { error: 'Failed to load recording' } 
      }));
    } finally {
      setLoadingRecording(prev => ({ ...prev, [callId]: false }));
    }
  };

  const getRecordingDisplay = (call) => {
    const recordingData = recordingUrls[call.call_id];
    
    if (loadingRecording[call.call_id]) {
      return <span className="loading-recording">Loading recording...</span>;
    }
    
    if (recordingData?.error) {
      return <span className="recording-error">❌ {recordingData.error}</span>;
    }
    
    if (recordingData?.url) {
      return (
        <a 
          href={recordingData.url} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="recording-link"
        >
          {recordingData.type === 'voicemail' ? '🔊 Listen to Voicemail' : '🎧 Play Recording'}
        </a>
      );
    }
    
    if (call.voicemail_link) {
      return (
        <a 
          href={call.voicemail_link} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="voicemail-link"
        >
          🔊 Listen to Voicemail
        </a>
      );
    }
    
    if (call.recording_id) {
      return (
        <button 
          onClick={() => fetchRecordingUrl(call.call_id)}
          className="btn-load-recording"
        >
          🎧 Load Recording
        </button>
      );
    }
    
    return <span className="no-recording">No recording available</span>;
  };

  if (loading && (!calls || calls.length === 0)) {
    return <div className="loading">Loading calls...</div>;
  }

  if (!calls || calls.length === 0) {
    return <div className="no-data">No calls found</div>;
  }

  return (
    <div className="calls-table-container">
      <div className="table-header">
        <span className="record-count">Total: {calls.length} calls</span>
      </div>
      <div className="calls-table-wrapper">
        <table className="calls-table">
          <thead>
            <tr>
              <th>Call ID</th>
              <th>Direction</th>
              <th>State</th>
              <th>Contact</th>
              <th>External Number</th>
              <th>Date Started (NY)</th>
              <th>Date Rang (NY)</th>
              <th>Date Connected (NY)</th>
              <th>Date Ended (NY)</th>
              <th>Duration</th>
              <th>Recorded</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((call) => (
              <React.Fragment key={call.call_id}>
                <tr className={expandedCall === call.call_id ? 'expanded' : ''}>
                  <td>
                    <span className="call-id">
                      {call.call_id.substring(0, 8)}...
                    </span>
                  </td>
                  <td>
                    <span className={`direction ${call.direction}`}>
                      {getDirectionIcon(call.direction)} {call.direction}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${getStateBadgeClass(call.state)}`}>
                      {call.state}
                    </span>
                  </td>
                  <td>
                    <div className="contact-info">
                      <span className="contact-name">{call.contact_name || 'Unknown'}</span>
                      <span className="contact-phone">{call.contact_phone || call.external_number}</span>
                    </div>
                  </td>
                  <td>{call.external_number || 'N/A'}</td>
                  <td className="date-cell">{formatEpochToNY(call.date_started)}</td>
                  <td className="date-cell">{formatEpochToNY(call.date_rang)}</td>
                  <td className="date-cell">{formatEpochToNY(call.date_connected)}</td>
                  <td className="date-cell">{formatEpochToNY(call.date_ended)}</td>
                  <td>
                    <span className="duration">{formatDuration(call.duration)}</span>
                  </td>
                  <td>
                    {call.recording_id ? (
                      <span className="has-recording" title="Has Recording ID">🎙️</span>
                    ) : call.was_recorded ? (
                      <span className="recorded">✅</span>
                    ) : (
                      <span className="not-recorded">❌</span>
                    )}
                  </td>
                  <td>
                    <button 
                      onClick={() => toggleExpand(call.call_id)}
                      className="btn-expand"
                    >
                      {expandedCall === call.call_id ? '▼' : '▶'}
                    </button>
                  </td>
                </tr>
                {expandedCall === call.call_id && (
                  <tr className="expanded-row">
                    <td colSpan="12">
                      <div className="expanded-content">
                        <div className="expanded-section">
                          <h4>Call Details</h4>
                          <div className="detail-grid">
                            <div className="detail-item">
                              <label>Full Call ID</label>
                              <span>{call.call_id}</span>
                            </div>
                            <div className="detail-item">
                              <label>Recording ID</label>
                              <span className="recording-id">
                                {call.recording_id || 'N/A'}
                              </span>
                            </div>
                            <div className="detail-item">
                              <label>Internal Number</label>
                              <span>{call.internal_number || 'N/A'}</span>
                            </div>
                            <div className="detail-item">
                              <label>Target</label>
                              <span>{call.target_name || 'N/A'}</span>
                            </div>
                            <div className="detail-item">
                              <label>Target Email</label>
                              <span>{call.target_email || 'N/A'}</span>
                            </div>
                            <div className="detail-item">
                              <label>Total Duration</label>
                              <span>{formatDuration(call.total_duration)}</span>
                            </div>
                            <div className="detail-item">
                              <label>Transferred</label>
                              <span>{call.is_transferred ? '✅ Yes' : '❌ No'}</span>
                            </div>
                            <div className="detail-item">
                              <label>MOS Score</label>
                              <span>{call.mos_score || 'N/A'}</span>
                            </div>
                            <div className="detail-item">
                              <label>Group ID</label>
                              <span className="truncate">{call.group_id || 'N/A'}</span>
                            </div>
                            <div className="detail-item">
                              <label>Master Call ID</label>
                              <span className="truncate">{call.master_call_id || 'N/A'}</span>
                            </div>
                            <div className="detail-item">
                              <label>Entry Point Call ID</label>
                              <span className="truncate">{call.entry_point_call_id || 'N/A'}</span>
                            </div>
                          </div>
                        </div>
                        
                        {(call.recording_id || call.voicemail_link) && (
                          <div className="expanded-section">
                            <h4>Recording</h4>
                            <div className="recording-section">
                              {getRecordingDisplay(call)}
                              {call.recording_id && (
                                <div className="recording-details">
                                  <span className="recording-id-label">Recording ID:</span>
                                  <code>{call.recording_id}</code>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {call.transcription_text && (
                          <div className="expanded-section">
                            <h4>Transcription</h4>
                            <p className="transcription">{call.transcription_text}</p>
                          </div>
                        )}
                        
                        <div className="expanded-section">
                          <h4>Timestamps (NY Timezone)</h4>
                          <div className="timestamp-grid">
                            <div className="timestamp-item">
                              <label>Started</label>
                              <span>{formatEpochToNY(call.date_started)}</span>
                            </div>
                            <div className="timestamp-item">
                              <label>Rang</label>
                              <span>{formatEpochToNY(call.date_rang)}</span>
                            </div>
                            <div className="timestamp-item">
                              <label>Connected</label>
                              <span>{formatEpochToNY(call.date_connected)}</span>
                            </div>
                            <div className="timestamp-item">
                              <label>Ended</label>
                              <span>{formatEpochToNY(call.date_ended)}</span>
                            </div>
                            <div className="timestamp-item">
                              <label>Event Timestamp</label>
                              <span>{formatEpochToNY(call.event_timestamp)}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="expanded-section">
                          <h4>Sync Information</h4>
                          <div className="detail-grid">
                            <div className="detail-item">
                              <label>Sync ID</label>
                              <span>{call.sync_id || 'N/A'}</span>
                            </div>
                            <div className="detail-item">
                              <label>Created At</label>
                              <span>{call.created_at ? format(new Date(call.created_at), 'MM/dd/yyyy HH:mm:ss') : 'N/A'}</span>
                            </div>
                            <div className="detail-item">
                              <label>Updated At</label>
                              <span>{call.updated_at ? format(new Date(call.updated_at), 'MM/dd/yyyy HH:mm:ss') : 'N/A'}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CallsTable;