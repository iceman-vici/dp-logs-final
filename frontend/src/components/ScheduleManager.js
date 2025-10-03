import React, { useState, useEffect } from 'react';
import { callsApi } from '../services/api';
import '../styles/ScheduleManager.css';

const ScheduleManager = () => {
  const [schedules, setSchedules] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    schedule_name: '',
    cron_expression: '0 2 * * *',
    sync_type: 'full',
    date_range_type: 'previous_day',
    date_range_value: 1,
    is_active: true,
    description: ''
  });
  const [cronValidation, setCronValidation] = useState({ valid: true, description: '' });

  useEffect(() => {
    fetchSchedules();
    fetchPresets();
  }, []);

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      const data = await callsApi.getSchedules();
      setSchedules(data);
    } catch (error) {
      console.error('Failed to fetch schedules:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPresets = async () => {
    try {
      const data = await callsApi.getSchedulePresets();
      setPresets(data);
    } catch (error) {
      console.error('Failed to fetch presets:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!cronValidation.valid) {
      alert('Invalid cron expression');
      return;
    }
    
    try {
      setLoading(true);
      
      if (editingSchedule) {
        await callsApi.updateSchedule(editingSchedule.id, formData);
      } else {
        await callsApi.createSchedule(formData);
      }
      
      fetchSchedules();
      resetForm();
    } catch (error) {
      console.error('Failed to save schedule:', error);
      alert('Failed to save schedule');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (schedule) => {
    setEditingSchedule(schedule);
    setFormData({
      schedule_name: schedule.schedule_name,
      cron_expression: schedule.cron_expression,
      sync_type: schedule.sync_type,
      date_range_type: schedule.date_range_type,
      date_range_value: schedule.date_range_value || 1,
      is_active: schedule.is_active,
      description: schedule.description || ''
    });
    setShowForm(true);
    validateCron(schedule.cron_expression);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this schedule?')) return;
    
    try {
      setLoading(true);
      await callsApi.deleteSchedule(id);
      fetchSchedules();
    } catch (error) {
      console.error('Failed to delete schedule:', error);
      alert('Failed to delete schedule');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (schedule) => {
    try {
      await callsApi.updateSchedule(schedule.id, {
        ...schedule,
        is_active: !schedule.is_active
      });
      fetchSchedules();
    } catch (error) {
      console.error('Failed to toggle schedule:', error);
    }
  };

  const handleTriggerNow = async (id) => {
    if (!window.confirm('Trigger this schedule now?')) return;
    
    try {
      setLoading(true);
      await callsApi.triggerSchedule(id);
      alert('Schedule triggered successfully');
    } catch (error) {
      console.error('Failed to trigger schedule:', error);
      alert('Failed to trigger schedule');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      schedule_name: '',
      cron_expression: '0 2 * * *',
      sync_type: 'full',
      date_range_type: 'previous_day',
      date_range_value: 1,
      is_active: true,
      description: ''
    });
    setEditingSchedule(null);
    setShowForm(false);
    setCronValidation({ valid: true, description: '' });
  };

  const validateCron = async (expression) => {
    try {
      const result = await callsApi.validateCron(expression);
      setCronValidation(result);
    } catch (error) {
      setCronValidation({ valid: false, error: 'Invalid expression' });
    }
  };

  const handleCronChange = (value) => {
    setFormData({ ...formData, cron_expression: value });
    validateCron(value);
  };

  const getNextRunTime = (cronExpression) => {
    // This is a simplified version - in production, you'd calculate actual next run time
    const parts = cronExpression.split(' ');
    if (parts[1] !== '*') {
      return `Daily at ${parts[1]}:${parts[0] === '0' ? '00' : parts[0]} NY Time`;
    }
    return 'Custom schedule';
  };

  const getDateRangeDescription = (type, value) => {
    switch (type) {
      case 'previous_day':
        return 'Previous day (yesterday)';
      case 'last_x_days':
        return `Last ${value} days`;
      case 'today':
        return 'Today\'s data';
      default:
        return 'Previous day';
    }
  };

  return (
    <div className="schedule-manager">
      <div className="schedule-header">
        <h2>🗓️ Auto-Schedule Manager</h2>
        <button 
          className="btn-add-schedule"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? '❌ Cancel' : '➕ Add Schedule'}
        </button>
      </div>

      {showForm && (
        <div className="schedule-form-container">
          <form onSubmit={handleSubmit} className="schedule-form">
            <h3>{editingSchedule ? 'Edit Schedule' : 'Create New Schedule'}</h3>
            
            <div className="form-group">
              <label>Schedule Name *</label>
              <input
                type="text"
                value={formData.schedule_name}
                onChange={(e) => setFormData({ ...formData, schedule_name: e.target.value })}
                required
                placeholder="e.g., Daily Midnight Sync"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Cron Expression *</label>
                <input
                  type="text"
                  value={formData.cron_expression}
                  onChange={(e) => handleCronChange(e.target.value)}
                  required
                  placeholder="e.g., 0 2 * * *"
                />
                {cronValidation.description && (
                  <span className={`cron-validation ${cronValidation.valid ? 'valid' : 'invalid'}`}>
                    {cronValidation.valid ? '✅' : '❌'} {cronValidation.description}
                  </span>
                )}
              </div>

              <div className="form-group">
                <label>Use Preset</label>
                <select 
                  onChange={(e) => {
                    const preset = presets.find(p => p.value === e.target.value);
                    if (preset) {
                      handleCronChange(preset.value);
                    }
                  }}
                  value=""
                >
                  <option value="">Select a preset...</option>
                  {presets.map(preset => (
                    <option key={preset.value} value={preset.value}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Sync Type</label>
                <select
                  value={formData.sync_type}
                  onChange={(e) => setFormData({ ...formData, sync_type: e.target.value })}
                >
                  <option value="full">Full Sync (All Calls)</option>
                  <option value="quick">Quick Sync (First 50)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Date Range</label>
                <select
                  value={formData.date_range_type}
                  onChange={(e) => setFormData({ ...formData, date_range_type: e.target.value })}
                >
                  <option value="previous_day">Previous Day</option>
                  <option value="last_x_days">Last X Days</option>
                  <option value="today">Today</option>
                </select>
              </div>

              {formData.date_range_type === 'last_x_days' && (
                <div className="form-group">
                  <label>Days</label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={formData.date_range_value}
                    onChange={(e) => setFormData({ ...formData, date_range_value: parseInt(e.target.value) })}
                  />
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description of this schedule"
                rows="3"
              />
            </div>

            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                />
                <span>Active (Enable this schedule)</span>
              </label>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn-save" disabled={loading || !cronValidation.valid}>
                {loading ? 'Saving...' : (editingSchedule ? 'Update Schedule' : 'Create Schedule')}
              </button>
              <button type="button" className="btn-cancel" onClick={resetForm}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="schedules-list">
        <h3>Configured Schedules</h3>
        {loading && <div className="loading">Loading schedules...</div>}
        
        {!loading && schedules.length === 0 && (
          <div className="no-schedules">
            <p>No schedules configured yet.</p>
            <p>Click "Add Schedule" to create your first automatic sync.</p>
          </div>
        )}

        {schedules.map(schedule => (
          <div key={schedule.id} className={`schedule-card ${!schedule.is_active ? 'inactive' : ''}`}>
            <div className="schedule-header-row">
              <h4>{schedule.schedule_name}</h4>
              <div className="schedule-status">
                <span className={`status-badge ${schedule.is_active ? 'active' : 'inactive'}`}>
                  {schedule.is_active ? '🟢 Active' : '🔴 Inactive'}
                </span>
              </div>
            </div>

            <div className="schedule-details">
              <div className="detail-row">
                <span className="detail-label">🕰️ Schedule:</span>
                <span className="detail-value">{getNextRunTime(schedule.cron_expression)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">📅 Date Range:</span>
                <span className="detail-value">{getDateRangeDescription(schedule.date_range_type, schedule.date_range_value)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">🔄 Sync Type:</span>
                <span className="detail-value">{schedule.sync_type === 'full' ? 'Full Sync' : 'Quick Sync'}</span>
              </div>
              {schedule.last_run_at && (
                <div className="detail-row">
                  <span className="detail-label">📈 Last Run:</span>
                  <span className="detail-value">
                    {new Date(schedule.last_run_at).toLocaleString()} 
                    <span className={`run-status ${schedule.last_run_status}`}>
                      ({schedule.last_run_status})
                    </span>
                  </span>
                </div>
              )}
              {schedule.description && (
                <div className="detail-row">
                  <span className="detail-label">📝 Description:</span>
                  <span className="detail-value">{schedule.description}</span>
                </div>
              )}
              <div className="detail-row stats">
                <span>🎯 Total Runs: {schedule.total_runs || 0}</span>
                <span>✅ Success: {schedule.successful_runs || 0}</span>
                <span>❌ Failed: {schedule.failed_runs || 0}</span>
              </div>
            </div>

            <div className="schedule-actions">
              <button 
                onClick={() => handleToggleActive(schedule)}
                className={`btn-toggle ${schedule.is_active ? 'btn-deactivate' : 'btn-activate'}`}
              >
                {schedule.is_active ? '⏸ Deactivate' : '▶️ Activate'}
              </button>
              <button 
                onClick={() => handleTriggerNow(schedule.id)}
                className="btn-trigger"
                disabled={!schedule.is_active}
              >
                🚀 Run Now
              </button>
              <button 
                onClick={() => handleEdit(schedule)}
                className="btn-edit"
              >
                ✏️ Edit
              </button>
              <button 
                onClick={() => handleDelete(schedule.id)}
                className="btn-delete"
              >
                🗑️ Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="schedule-help">
        <h4>ℹ️ Cron Expression Help</h4>
        <p>Format: minute hour day month weekday</p>
        <ul>
          <li><code>0 2 * * *</code> - Every day at 2:00 AM</li>
          <li><code>0 0 * * 0</code> - Every Sunday at midnight</li>
          <li><code>*/15 * * * *</code> - Every 15 minutes</li>
          <li><code>0 9 * * 1-5</code> - Weekdays at 9:00 AM</li>
        </ul>
      </div>
    </div>
  );
};

export default ScheduleManager;