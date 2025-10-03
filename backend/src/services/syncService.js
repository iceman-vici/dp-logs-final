const { pool } = require('../config/database');
const dialpadService = require('./dialpadService');
const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');

class SyncService extends EventEmitter {
  constructor() {
    super();
    this.activeSyncs = new Map();
  }

  // Create a new sync job
  async createSyncJob(from, to, mode = 'full', createdBy = 'manual') {
    const syncId = uuidv4();
    
    // Validate date range
    dialpadService.validateDateRange(from, to);
    
    // Insert sync log
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
      RETURNING *;
    `;
    
    const fromTimestamp = new Date(from + ' America/New_York');
    const toTimestamp = new Date(to + ' America/New_York');
    
    const result = await pool.query(query, [
      syncId,
      fromTimestamp,
      toTimestamp,
      from,
      to,
      mode,
      createdBy
    ]);
    
    const syncJob = result.rows[0];
    this.activeSyncs.set(syncId, { status: 'pending', progress: 0 });
    
    // Start the sync process asynchronously
    this.executeSyncJob(syncJob).catch(error => {
      console.error(`[SyncService] Error in sync job ${syncId}:`, error);
    });
    
    return syncJob;
  }

  // Execute sync job
  async executeSyncJob(syncJob) {
    const { sync_id, date_from_ny, date_to_ny, sync_mode } = syncJob;
    
    console.log(`[SyncService] Starting sync job ${sync_id}`);
    console.log(`[SyncService] Date range: ${date_from_ny} to ${date_to_ny}`);
    console.log(`[SyncService] Mode: ${sync_mode}`);
    
    try {
      // Update status to in_progress
      await this.updateSyncStatus(sync_id, 'in_progress');
      
      // Fetch calls from Dialpad
      const calls = await this.fetchCallsForSync(
        sync_id,
        date_from_ny,
        date_to_ny,
        sync_mode
      );
      
      console.log(`[SyncService] Fetched ${calls.length} calls from Dialpad`);
      
      // Process and insert calls
      const result = await this.processAndInsertCalls(sync_id, calls);
      
      // Update sync log with results
      await this.completeSyncJob(
        sync_id,
        result.totalCalls,
        result.insertedCount,
        result.failedCount,
        result.status
      );
      
      console.log(`[SyncService] Sync job ${sync_id} completed: ${result.status}`);
      console.log(`[SyncService] Results: ${result.insertedCount} inserted, ${result.failedCount} failed`);
      
      // Emit completion event
      this.emit('sync-completed', {
        syncId: sync_id,
        ...result
      });
      
      return result;
    } catch (error) {
      console.error(`[SyncService] Sync job ${sync_id} failed:`, error);
      
      // Update status to failed
      await this.updateSyncStatus(sync_id, 'failed', error.message);
      
      // Emit failure event
      this.emit('sync-failed', {
        syncId: sync_id,
        error: error.message
      });
      
      throw error;
    } finally {
      // Remove from active syncs
      this.activeSyncs.delete(sync_id);
    }
  }

  // Fetch calls for sync
  async fetchCallsForSync(syncId, from, to, mode) {
    const calls = [];
    let page = 0;
    
    // Progress callback
    const onProgress = (progress) => {
      page = progress.page;
      
      // Update page count in database
      this.updateSyncProgress(syncId, progress.fetched, page);
      
      // Emit progress event
      this.emit('sync-progress', {
        syncId,
        ...progress
      });
    };
    
    if (mode === 'quick') {
      // Quick sync - just fetch first page
      const result = await dialpadService.fetchCalls(from, to, null, 50);
      return result.calls;
    } else {
      // Full sync - fetch all pages
      return await dialpadService.fetchAllCalls(from, to, onProgress);
    }
  }

  // Process and insert calls into database
  async processAndInsertCalls(syncId, calls) {
    let insertedCount = 0;
    let failedCount = 0;
    const failedCalls = [];
    
    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      const pageNumber = Math.floor(i / 50) + 1;
      
      try {
        // Transform call data
        const transformedCall = dialpadService.transformCall(call);
        
        // Insert or update call
        await this.upsertCall(transformedCall, syncId);
        
        // Log success
        await this.logSyncDetail(
          syncId,
          transformedCall.call_id,
          pageNumber,
          'success'
        );
        
        insertedCount++;
        
        // Update progress periodically
        if (insertedCount % 10 === 0) {
          await this.updateSyncProgress(syncId, insertedCount + failedCount);
          
          this.emit('sync-progress', {
            syncId,
            processed: insertedCount + failedCount,
            total: calls.length,
            insertedCount,
            failedCount
          });
        }
      } catch (error) {
        console.error(`[SyncService] Error processing call ${call.id || call.call_id}:`, error.message);
        
        failedCount++;
        failedCalls.push({
          call_id: call.id || call.call_id,
          error: error.message
        });
        
        // Log failure
        await this.logSyncDetail(
          syncId,
          call.id || call.call_id,
          pageNumber,
          'failed',
          error.message
        );
      }
    }
    
    // Determine final status
    const status = failedCount === 0 ? 'completed' : 
                   failedCount === calls.length ? 'failed' : 'partial';
    
    return {
      totalCalls: calls.length,
      insertedCount,
      failedCount,
      failedCalls,
      status
    };
  }

  // Upsert a call record
  async upsertCall(call, syncId) {
    const query = `
      INSERT INTO call_logs (
        call_id,
        date_started,
        date_rang,
        date_connected,
        date_ended,
        date_from_ny,
        date_to_ny,
        direction,
        duration,
        state,
        external_number,
        internal_number,
        contact_name,
        contact_phone,
        target,
        target_name,
        target_email,
        was_recorded,
        recording_id,
        voicemail_link,
        transcription_text,
        is_transferred,
        total_duration,
        group_id,
        entry_point_call_id,
        master_call_id,
        mos_score,
        event_timestamp,
        sync_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, $28, $29
      )
      ON CONFLICT (call_id) DO UPDATE SET
        date_started = EXCLUDED.date_started,
        date_rang = EXCLUDED.date_rang,
        date_connected = EXCLUDED.date_connected,
        date_ended = EXCLUDED.date_ended,
        date_from_ny = EXCLUDED.date_from_ny,
        date_to_ny = EXCLUDED.date_to_ny,
        direction = EXCLUDED.direction,
        duration = EXCLUDED.duration,
        state = EXCLUDED.state,
        external_number = EXCLUDED.external_number,
        internal_number = EXCLUDED.internal_number,
        contact_name = EXCLUDED.contact_name,
        contact_phone = EXCLUDED.contact_phone,
        target = EXCLUDED.target,
        target_name = EXCLUDED.target_name,
        target_email = EXCLUDED.target_email,
        was_recorded = EXCLUDED.was_recorded,
        recording_id = EXCLUDED.recording_id,
        voicemail_link = EXCLUDED.voicemail_link,
        transcription_text = EXCLUDED.transcription_text,
        is_transferred = EXCLUDED.is_transferred,
        total_duration = EXCLUDED.total_duration,
        group_id = EXCLUDED.group_id,
        entry_point_call_id = EXCLUDED.entry_point_call_id,
        master_call_id = EXCLUDED.master_call_id,
        mos_score = EXCLUDED.mos_score,
        event_timestamp = EXCLUDED.event_timestamp,
        sync_id = EXCLUDED.sync_id,
        updated_at = CURRENT_TIMESTAMP;
    `;
    
    await pool.query(query, [
      call.call_id,
      call.date_started,
      call.date_rang,
      call.date_connected,
      call.date_ended,
      call.date_from_ny,
      call.date_to_ny,
      call.direction,
      call.duration,
      call.state,
      call.external_number,
      call.internal_number,
      call.contact_name,
      call.contact_phone,
      call.target,
      call.target_name,
      call.target_email,
      call.was_recorded,
      call.recording_id,
      call.voicemail_link,
      call.transcription_text,
      call.is_transferred,
      call.total_duration,
      call.group_id,
      call.entry_point_call_id,
      call.master_call_id,
      call.mos_score,
      call.event_timestamp,
      syncId
    ]);
  }

  // Update sync status
  async updateSyncStatus(syncId, status, errorMessage = null) {
    const query = `
      UPDATE sync_logs
      SET 
        status = $2,
        error_message = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE sync_id = $1;
    `;
    
    await pool.query(query, [syncId, status, errorMessage]);
  }

  // Update sync progress
  async updateSyncProgress(syncId, totalCalls, totalPages = null) {
    const query = `
      UPDATE sync_logs
      SET 
        total_calls = $2,
        total_pages = COALESCE($3, total_pages),
        updated_at = CURRENT_TIMESTAMP
      WHERE sync_id = $1;
    `;
    
    await pool.query(query, [syncId, totalCalls, totalPages]);
  }

  // Complete sync job
  async completeSyncJob(syncId, totalCalls, insertedCount, failedCount, status) {
    const query = `
      UPDATE sync_logs
      SET 
        status = $2,
        total_calls = $3,
        inserted_count = $4,
        failed_count = $5,
        ended_at = CURRENT_TIMESTAMP,
        duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at)),
        updated_at = CURRENT_TIMESTAMP
      WHERE sync_id = $1;
    `;
    
    await pool.query(query, [
      syncId,
      status,
      totalCalls,
      insertedCount,
      failedCount
    ]);
  }

  // Log sync detail
  async logSyncDetail(syncId, callId, pageNumber, status, errorMessage = null) {
    const query = `
      INSERT INTO sync_log_details (
        sync_id,
        call_id,
        page_number,
        status,
        error_message
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (sync_id, call_id) DO UPDATE SET
        status = EXCLUDED.status,
        error_message = EXCLUDED.error_message,
        retry_count = sync_log_details.retry_count + 1,
        processed_at = CURRENT_TIMESTAMP;
    `;
    
    await pool.query(query, [
      syncId,
      callId,
      pageNumber,
      status,
      errorMessage
    ]);
  }

  // Get sync job status
  async getSyncJobStatus(syncId) {
    const query = `
      SELECT * FROM sync_summary_view
      WHERE sync_id = $1;
    `;
    
    const result = await pool.query(query, [syncId]);
    return result.rows[0] || null;
  }

  // Get sync logs
  async getSyncLogs(limit = 10, offset = 0) {
    const query = `
      SELECT * FROM sync_summary_view
      ORDER BY started_at DESC
      LIMIT $1 OFFSET $2;
    `;
    
    const result = await pool.query(query, [limit, offset]);
    return result.rows;
  }

  // Get sync log details
  async getSyncLogDetails(syncId, status = null, limit = 100) {
    let query = `
      SELECT * FROM sync_log_details
      WHERE sync_id = $1
    `;
    
    const params = [syncId];
    
    if (status) {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }
    
    query += ` ORDER BY processed_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const result = await pool.query(query, params);
    return result.rows;
  }

  // Retry failed sync items
  async retryFailedSync(syncId) {
    // Get failed calls from the sync
    const query = `
      SELECT call_id FROM sync_log_details
      WHERE sync_id = $1 AND status = 'failed';
    `;
    
    const result = await pool.query(query, [syncId]);
    const failedCallIds = result.rows.map(r => r.call_id);
    
    if (failedCallIds.length === 0) {
      return { message: 'No failed calls to retry', successCount: 0, stillFailedCount: 0 };
    }
    
    console.log(`[SyncService] Retrying ${failedCallIds.length} failed calls for sync ${syncId}`);
    
    // Get original sync parameters
    const syncQuery = `
      SELECT date_from_ny, date_to_ny FROM sync_logs
      WHERE sync_id = $1;
    `;
    
    const syncResult = await pool.query(syncQuery, [syncId]);
    const { date_from_ny, date_to_ny } = syncResult.rows[0];
    
    // Fetch all calls again and filter to just the failed ones
    const calls = await dialpadService.fetchAllCalls(date_from_ny, date_to_ny);
    const failedCalls = calls.filter(c => 
      failedCallIds.includes(c.id || c.call_id)
    );
    
    // Retry processing
    let successCount = 0;
    let stillFailedCount = 0;
    
    for (const call of failedCalls) {
      try {
        const transformedCall = dialpadService.transformCall(call);
        await this.upsertCall(transformedCall, syncId);
        
        // Update status to retry_success
        await this.updateSyncDetailStatus(
          syncId,
          transformedCall.call_id,
          'success'
        );
        
        successCount++;
      } catch (error) {
        console.error(`[SyncService] Retry failed for call ${call.id}:`, error.message);
        
        // Update retry count
        await this.updateSyncDetailStatus(
          syncId,
          call.id || call.call_id,
          'retry_failed',
          error.message
        );
        
        stillFailedCount++;
      }
    }
    
    console.log(`[SyncService] Retry complete: ${successCount} succeeded, ${stillFailedCount} still failed`);
    
    return {
      message: 'Retry completed',
      successCount,
      stillFailedCount
    };
  }

  // Update sync detail status
  async updateSyncDetailStatus(syncId, callId, status, errorMessage = null) {
    const query = `
      UPDATE sync_log_details
      SET 
        status = $3,
        error_message = $4,
        processed_at = CURRENT_TIMESTAMP
      WHERE sync_id = $1 AND call_id = $2;
    `;
    
    await pool.query(query, [syncId, callId, status, errorMessage]);
  }
}

module.exports = new SyncService();