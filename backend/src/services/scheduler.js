const cron = require('node-cron');
const { pool } = require('../config/database');
const { format, subDays } = require('date-fns');
const { utcToZonedTime } = require('date-fns-tz');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// Store active cron jobs
const cronJobs = new Map();

// NY timezone
const NY_TZ = 'America/New_York';

class SyncScheduler {
  constructor(io) {
    this.io = io;
    this.isInitialized = false;
  }

  // Initialize scheduler
  async initialize() {
    if (this.isInitialized) return;
    
    console.log('Initializing sync scheduler...');
    
    try {
      // Load all active schedules
      await this.loadSchedules();
      
      // Start monitoring for schedule changes
      this.startScheduleMonitor();
      
      this.isInitialized = true;
      console.log('Sync scheduler initialized successfully');
    } catch (error) {
      console.error('Failed to initialize scheduler:', error);
    }
  }

  // Load all active schedules from database
  async loadSchedules() {
    try {
      const query = `
        SELECT * FROM sync_schedules
        WHERE is_active = true;
      `;
      
      const result = await pool.query(query);
      
      for (const schedule of result.rows) {
        this.startSchedule(schedule);
      }
      
      console.log(`Loaded ${result.rows.length} active schedules`);
    } catch (error) {
      console.error('Error loading schedules:', error);
    }
  }

  // Start a schedule
  startSchedule(schedule) {
    const { id, schedule_name, cron_expression, is_active } = schedule;
    
    if (!is_active) return;
    
    // Stop existing job if any
    this.stopSchedule(id);
    
    // Validate cron expression
    if (!cron.validate(cron_expression)) {
      console.error(`Invalid cron expression for schedule ${id}: ${cron_expression}`);
      return;
    }
    
    // Create cron job
    const job = cron.schedule(cron_expression, async () => {
      await this.executeSchedule(schedule);
    }, {
      scheduled: true,
      timezone: NY_TZ
    });
    
    cronJobs.set(id, job);
    console.log(`Started schedule: ${schedule_name} (${cron_expression})`);
    
    // Calculate and update next run time
    this.updateNextRunTime(id, cron_expression);
  }

  // Stop a schedule
  stopSchedule(scheduleId) {
    const job = cronJobs.get(scheduleId);
    if (job) {
      job.stop();
      cronJobs.delete(scheduleId);
      console.log(`Stopped schedule ${scheduleId}`);
    }
  }

  // Execute a scheduled sync
  async executeSchedule(schedule) {
    const {
      id,
      schedule_name,
      sync_type,
      date_range_type,
      date_range_value
    } = schedule;
    
    console.log(`Executing scheduled sync: ${schedule_name}`);
    
    try {
      // Calculate date range based on configuration
      const { fromDate, toDate } = this.calculateDateRange(date_range_type, date_range_value);
      
      // Create sync log
      const syncId = await this.createScheduledSync(
        fromDate,
        toDate,
        sync_type,
        `Scheduled: ${schedule_name}`
      );
      
      // Record schedule execution
      await this.recordScheduleExecution(id, syncId, 'started', fromDate, toDate);
      
      // Update last run info
      await this.updateScheduleLastRun(id, syncId, 'running');
      
      // Execute sync via internal API call
      const syncResult = await this.executeSyncJob(fromDate, toDate, sync_type);
      
      // Update status based on result
      const finalStatus = syncResult.success ? 'completed' : 'failed';
      await this.recordScheduleExecution(id, syncId, finalStatus, fromDate, toDate);
      await this.updateScheduleLastRun(id, syncId, finalStatus);
      
      console.log(`Scheduled sync completed: ${schedule_name}`);
      
      // Broadcast to WebSocket clients
      if (this.io) {
        this.io.emit('scheduled-sync-completed', {
          scheduleId: id,
          scheduleName: schedule_name,
          syncId,
          status: finalStatus,
          fromDate,
          toDate
        });
      }
      
    } catch (error) {
      console.error(`Failed to execute scheduled sync ${schedule_name}:`, error);
      
      // Record failure
      await this.recordScheduleExecution(id, null, 'failed', null, null, error.message);
      await this.updateScheduleLastRun(id, null, 'failed');
      
      // Broadcast error
      if (this.io) {
        this.io.emit('scheduled-sync-failed', {
          scheduleId: id,
          scheduleName: schedule_name,
          error: error.message
        });
      }
    }
  }

  // Calculate date range based on configuration
  calculateDateRange(rangeType, rangeValue) {
    const now = new Date();
    const nyNow = utcToZonedTime(now, NY_TZ);
    
    let fromDate, toDate;
    
    switch (rangeType) {
      case 'previous_day':
        // Yesterday's full day
        fromDate = subDays(nyNow, 1);
        fromDate.setHours(0, 0, 0, 0);
        toDate = subDays(nyNow, 1);
        toDate.setHours(23, 59, 59, 999);
        break;
        
      case 'last_x_days':
        // Last X days including today
        fromDate = subDays(nyNow, rangeValue || 1);
        fromDate.setHours(0, 0, 0, 0);
        toDate = nyNow;
        toDate.setHours(23, 59, 59, 999);
        break;
        
      case 'today':
        // Today's data so far
        fromDate = nyNow;
        fromDate.setHours(0, 0, 0, 0);
        toDate = nyNow;
        break;
        
      default:
        // Default to previous day
        fromDate = subDays(nyNow, 1);
        fromDate.setHours(0, 0, 0, 0);
        toDate = subDays(nyNow, 1);
        toDate.setHours(23, 59, 59, 999);
    }
    
    return {
      fromDate: format(fromDate, "yyyy-MM-dd'T'HH:mm:ss"),
      toDate: format(toDate, "yyyy-MM-dd'T'HH:mm:ss")
    };
  }

  // Create scheduled sync log
  async createScheduledSync(fromDate, toDate, syncType, description) {
    const syncId = uuidv4();
    
    const query = `
      INSERT INTO sync_logs (
        sync_id, 
        date_from, 
        date_to, 
        date_from_ny, 
        date_to_ny, 
        sync_mode, 
        status,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
      RETURNING sync_id;
    `;
    
    // Convert dates to timestamps
    const fromTimestamp = new Date(fromDate + ' America/New_York');
    const toTimestamp = new Date(toDate + ' America/New_York');
    
    const result = await pool.query(query, [
      syncId,
      fromTimestamp,
      toTimestamp,
      fromDate,
      toDate,
      syncType,
      description
    ]);
    
    return result.rows[0].sync_id;
  }

  // Execute sync job
  async executeSyncJob(fromDate, toDate, syncType) {
    try {
      // Call internal sync API
      const response = await axios.post(
        `http://localhost:${process.env.PORT || 3001}/api/sync/start`,
        {
          from: fromDate,
          to: toDate,
          mode: syncType
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Request': 'scheduler'
          }
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Sync job execution failed:', error.message);
      throw error;
    }
  }

  // Record schedule execution history
  async recordScheduleExecution(scheduleId, syncId, status, fromDate, toDate, errorMessage = null) {
    const query = `
      INSERT INTO sync_schedule_history (
        schedule_id,
        sync_id,
        status,
        date_from,
        date_to,
        error_message
      )
      VALUES ($1, $2, $3, $4, $5, $6);
    `;
    
    await pool.query(query, [
      scheduleId,
      syncId,
      status,
      fromDate ? new Date(fromDate + ' America/New_York') : null,
      toDate ? new Date(toDate + ' America/New_York') : null,
      errorMessage
    ]);
  }

  // Update schedule last run info
  async updateScheduleLastRun(scheduleId, syncId, status) {
    const query = `
      UPDATE sync_schedules
      SET 
        last_run_at = CURRENT_TIMESTAMP,
        last_run_status = $2,
        last_run_sync_id = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1;
    `;
    
    await pool.query(query, [scheduleId, status, syncId]);
  }

  // Update next run time
  async updateNextRunTime(scheduleId, cronExpression) {
    // This would calculate the next run time based on cron expression
    // For now, we'll let the cron library handle it
  }

  // Monitor for schedule changes
  startScheduleMonitor() {
    // Check for schedule changes every minute
    setInterval(async () => {
      await this.checkScheduleChanges();
    }, 60000); // 1 minute
  }

  // Check for schedule changes
  async checkScheduleChanges() {
    try {
      const query = `
        SELECT * FROM sync_schedules;
      `;
      
      const result = await pool.query(query);
      const schedules = result.rows;
      
      // Check for new or updated schedules
      for (const schedule of schedules) {
        const existingJob = cronJobs.get(schedule.id);
        
        if (schedule.is_active && !existingJob) {
          // New active schedule
          this.startSchedule(schedule);
        } else if (!schedule.is_active && existingJob) {
          // Deactivated schedule
          this.stopSchedule(schedule.id);
        }
      }
      
      // Check for deleted schedules
      for (const [scheduleId, job] of cronJobs.entries()) {
        const stillExists = schedules.some(s => s.id === scheduleId);
        if (!stillExists) {
          this.stopSchedule(scheduleId);
        }
      }
    } catch (error) {
      console.error('Error checking schedule changes:', error);
    }
  }

  // Get all schedules
  async getSchedules() {
    const query = `
      SELECT * FROM sync_schedules_view
      ORDER BY id;
    `;
    
    const result = await pool.query(query);
    return result.rows;
  }

  // Create or update schedule
  async upsertSchedule(scheduleData) {
    const {
      id,
      schedule_name,
      cron_expression,
      sync_type,
      date_range_type,
      date_range_value,
      is_active,
      description
    } = scheduleData;
    
    if (id) {
      // Update existing
      const query = `
        UPDATE sync_schedules
        SET 
          schedule_name = $2,
          cron_expression = $3,
          sync_type = $4,
          date_range_type = $5,
          date_range_value = $6,
          is_active = $7,
          description = $8,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *;
      `;
      
      const result = await pool.query(query, [
        id,
        schedule_name,
        cron_expression,
        sync_type,
        date_range_type,
        date_range_value,
        is_active,
        description
      ]);
      
      // Restart schedule if active
      if (is_active) {
        this.startSchedule(result.rows[0]);
      } else {
        this.stopSchedule(id);
      }
      
      return result.rows[0];
    } else {
      // Create new
      const query = `
        INSERT INTO sync_schedules (
          schedule_name,
          cron_expression,
          sync_type,
          date_range_type,
          date_range_value,
          is_active,
          description
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *;
      `;
      
      const result = await pool.query(query, [
        schedule_name,
        cron_expression,
        sync_type,
        date_range_type,
        date_range_value,
        is_active,
        description
      ]);
      
      // Start schedule if active
      if (is_active) {
        this.startSchedule(result.rows[0]);
      }
      
      return result.rows[0];
    }
  }

  // Delete schedule
  async deleteSchedule(scheduleId) {
    // Stop the schedule first
    this.stopSchedule(scheduleId);
    
    const query = `
      DELETE FROM sync_schedules
      WHERE id = $1;
    `;
    
    await pool.query(query, [scheduleId]);
  }

  // Trigger manual run of a schedule
  async triggerManualRun(scheduleId) {
    const query = `
      SELECT * FROM sync_schedules
      WHERE id = $1;
    `;
    
    const result = await pool.query(query, [scheduleId]);
    
    if (result.rows.length === 0) {
      throw new Error('Schedule not found');
    }
    
    const schedule = result.rows[0];
    await this.executeSchedule(schedule);
    
    return { success: true, message: 'Manual run triggered' };
  }
}

module.exports = SyncScheduler;