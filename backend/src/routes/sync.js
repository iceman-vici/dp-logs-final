const express = require('express');
const router = express.Router();
const axios = require('axios');
const { pool } = require('../config/database');
const { zonedTimeToUtc } = require('date-fns-tz');
const { v4: uuidv4 } = require('uuid');

// Background sync jobs storage (in production, use Redis or a job queue)
const syncJobs = new Map();

// Helper: NY ISO to UTC ms epoch
function nyToUtcEpoch(nyIsoString) {
  const nyTz = 'America/New_York';
  const nyDate = new Date(nyIsoString);
  const utcDate = zonedTimeToUtc(nyDate, nyTz);
  return utcDate.getTime();
}

// Helper: Create sync log entry
async function createSyncLog(fromNY, toNY, syncMode) {
  const syncId = uuidv4();
  const query = `
    INSERT INTO sync_logs (sync_id, date_from, date_to, date_from_ny, date_to_ny, sync_mode, status)
    VALUES ($1, to_timestamp($2::BIGINT/1000), to_timestamp($3::BIGINT/1000), $4, $5, $6, 'in_progress')
    RETURNING *;
  `;
  
  const fromUtc = nyToUtcEpoch(fromNY);
  const toUtc = nyToUtcEpoch(toNY);
  
  const result = await pool.query(query, [syncId, fromUtc, toUtc, fromNY, toNY, syncMode]);
  return result.rows[0];
}

// Helper: Update sync log
async function updateSyncLog(syncId, updates) {
  const fields = [];
  const values = [];
  let paramCount = 1;
  
  Object.entries(updates).forEach(([key, value]) => {
    fields.push(`${key} = $${paramCount}`);
    values.push(value);
    paramCount++;
  });
  
  values.push(syncId);
  
  const query = `
    UPDATE sync_logs 
    SET ${fields.join(', ')}, completed_at = CURRENT_TIMESTAMP
    WHERE sync_id = $${paramCount}
    RETURNING *;
  `;
  
  const result = await pool.query(query, values);
  return result.rows[0];
}

// Helper: Log sync detail
async function logSyncDetail(syncId, callId, pageNumber, status, errorMessage = null, rawData = null) {
  // First check if the combination already exists
  const checkQuery = `
    SELECT id FROM sync_log_details 
    WHERE sync_id = $1 AND call_id = $2
    LIMIT 1;
  `;
  
  const existing = await pool.query(checkQuery, [syncId, callId]);
  
  if (existing.rows.length > 0) {
    // Update existing record
    const updateQuery = `
      UPDATE sync_log_details 
      SET status = $3, 
          error_message = $4, 
          retry_count = retry_count + 1,
          processed_at = CURRENT_TIMESTAMP
      WHERE sync_id = $1 AND call_id = $2
      RETURNING *;
    `;
    await pool.query(updateQuery, [syncId, callId, status, errorMessage]);
  } else {
    // Insert new record
    const insertQuery = `
      INSERT INTO sync_log_details (sync_id, call_id, page_number, status, error_message, raw_data)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    await pool.query(insertQuery, [syncId, callId, pageNumber, status, errorMessage, rawData]);
  }
}

// Helper: Upsert contact or user
async function upsertContactOrUser(table, item) {
  const { id, email, name, phone, type } = item;
  const query = `
    INSERT INTO ${table} (id, email, name, phone, type)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email, name = EXCLUDED.name, phone = EXCLUDED.phone, type = EXCLUDED.type,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id;
  `;
  await pool.query(query, [id, email || null, name || null, phone || null, type || null]);
}

// Helper: Insert call with sync reference
async function insertCall(call, syncId) {
  const {
    call_id, contact, target, date_started, date_rang, date_connected, date_ended,
    direction, duration, total_duration, state, external_number, internal_number,
    is_transferred, was_recorded, mos_score, group_id, entry_point_call_id,
    master_call_id, event_timestamp, transcription_text, voicemail_link,
    voicemail_recording_id
  } = call;

  await upsertContactOrUser('contacts', contact);
  if (target && target.id !== contact.id) {
    await upsertContactOrUser('users', target);
  }

  const query = `
    INSERT INTO calls (
      call_id, sync_id, contact_id, target_id, date_started, date_rang, date_connected, date_ended,
      direction, duration, total_duration, state, external_number, internal_number,
      is_transferred, was_recorded, mos_score, group_id, entry_point_call_id,
      master_call_id, event_timestamp, transcription_text, voicemail_link,
      voicemail_recording_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
    ON CONFLICT (call_id) DO UPDATE SET
      sync_id = EXCLUDED.sync_id,
      contact_id = EXCLUDED.contact_id, target_id = EXCLUDED.target_id,
      date_started = EXCLUDED.date_started, date_rang = EXCLUDED.date_rang,
      date_connected = EXCLUDED.date_connected, date_ended = EXCLUDED.date_ended,
      direction = EXCLUDED.direction, duration = EXCLUDED.duration,
      total_duration = EXCLUDED.total_duration, state = EXCLUDED.state,
      external_number = EXCLUDED.external_number, internal_number = EXCLUDED.internal_number,
      is_transferred = EXCLUDED.is_transferred, was_recorded = EXCLUDED.was_recorded,
      mos_score = EXCLUDED.mos_score, group_id = EXCLUDED.group_id,
      entry_point_call_id = EXCLUDED.entry_point_call_id, master_call_id = EXCLUDED.master_call_id,
      event_timestamp = EXCLUDED.event_timestamp, transcription_text = EXCLUDED.transcription_text,
      voicemail_link = EXCLUDED.voicemail_link, voicemail_recording_id = EXCLUDED.voicemail_recording_id,
      updated_at = CURRENT_TIMESTAMP
    RETURNING call_id;
  `;
  const values = [
    call_id, syncId, contact.id, target?.id || null,
    date_started, date_rang || null, date_connected || null, date_ended || null,
    direction, parseFloat(duration), parseFloat(total_duration) || null, state, external_number, internal_number,
    is_transferred || false, was_recorded || false, parseFloat(mos_score) || null, group_id || null,
    entry_point_call_id || null, master_call_id || null, event_timestamp,
    transcription_text || null, voicemail_link || null, voicemail_recording_id || null
  ];
  await pool.query(query, values);
}

// Helper: Insert recording
async function insertRecording(call_id, details) {
  for (const rec of details || []) {
    const { id, duration: rec_duration, recording_type, start_time, url } = rec;
    const query = `
      INSERT INTO recording_details (id, call_id, duration, recording_type, start_time, url)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        call_id = EXCLUDED.call_id, duration = EXCLUDED.duration,
        recording_type = EXCLUDED.recording_type, start_time = EXCLUDED.start_time,
        url = EXCLUDED.url
      RETURNING id;
    `;
    await pool.query(query, [id, call_id, rec_duration, recording_type, start_time, url]);
  }
}

// Helper: Rate limiter
class RateLimiter {
  constructor(maxRequests = 15, windowMs = 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = [];
  }

  async waitIfNeeded() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = this.windowMs - (now - oldestRequest) + 100;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.waitIfNeeded();
    }
    
    this.requests.push(now);
  }
}

// Background sync processor
async function processSyncJob(jobId) {
  const job = syncJobs.get(jobId);
  if (!job) return;
  
  const { syncLog, fromUtc, toUtc } = job;
  const rateLimiter = new RateLimiter(15, 1000);
  let cursor = null;
  let pageCount = 0;
  let totalCalls = 0;
  let insertedCount = 0;
  let failedCount = 0;
  const startTime = Date.now();
  
  job.status = 'running';
  job.progress = { pageCount, totalCalls, insertedCount, failedCount };
  
  try {
    while (true) {
      await rateLimiter.waitIfNeeded();
      
      const params = new URLSearchParams({
        limit: '50',
        started_after: fromUtc.toString(),
        started_before: toUtc.toString(),
      });
      
      if (cursor) {
        params.append('cursor', cursor);
      }
      
      pageCount++;
      job.progress.currentPage = pageCount;
      job.progress.message = `Fetching page ${pageCount}...`;
      
      const response = await axios.get('https://dialpad.com/api/v2/call', {
        headers: {
          'Authorization': `Bearer ${process.env.DIALPAD_TOKEN}`,
          'Accept': 'application/json',
        },
        params,
        timeout: 30000,
      });
      
      const { items, cursor: nextCursor } = response.data;
      
      if (!items || items.length === 0) {
        break;
      }
      
      // Process each call immediately (per page)
      for (const call of items) {
        totalCalls++;
        try {
          await insertCall(call, syncLog.sync_id);
          if (call.recording_details) {
            await insertRecording(call.call_id, call.recording_details);
          }
          await logSyncDetail(syncLog.sync_id, call.call_id, pageCount, 'success', null, JSON.stringify(call));
          insertedCount++;
        } catch (error) {
          console.error(`Failed to insert call ${call.call_id}:`, error.message);
          await logSyncDetail(syncLog.sync_id, call.call_id, pageCount, 'failed', error.message, JSON.stringify(call));
          failedCount++;
        }
        
        // Update progress
        job.progress = { pageCount, totalCalls, insertedCount, failedCount };
      }
      
      // Update sync log after each page
      await updateSyncLog(syncLog.sync_id, {
        total_calls: totalCalls,
        total_pages: pageCount,
        inserted_count: insertedCount,
        failed_count: failedCount
      });
      
      if (!nextCursor || nextCursor === cursor) {
        break;
      }
      cursor = nextCursor;
    }
    
    // Final update
    const duration = Math.round((Date.now() - startTime) / 1000);
    await updateSyncLog(syncLog.sync_id, {
      status: failedCount > 0 ? 'partial' : 'completed',
      total_calls: totalCalls,
      total_pages: pageCount,
      inserted_count: insertedCount,
      failed_count: failedCount,
      duration_seconds: duration
    });
    
    job.status = 'completed';
    job.result = { totalCalls, insertedCount, failedCount, duration };
    
  } catch (error) {
    console.error('Sync job error:', error);
    await updateSyncLog(syncLog.sync_id, {
      status: 'failed',
      error_message: error.message,
      total_calls: totalCalls,
      total_pages: pageCount,
      inserted_count: insertedCount,
      failed_count: failedCount
    });
    
    job.status = 'failed';
    job.error = error.message;
  }
}

// GET /api/sync - Sync status and info
router.get('/', (req, res) => {
  res.json({
    status: 'Sync API is running',
    endpoints: {
      'POST /api/sync/start': 'Start a new sync job',
      'GET /api/sync/status/:jobId': 'Get job status',
      'GET /api/sync/logs': 'Get sync history',
      'GET /api/sync/logs/:syncId/details': 'Get sync details',
      'POST /api/sync/retry/:syncId': 'Retry failed calls',
      'GET /api/sync/download-quick': 'Quick sync (50 calls)',
      'GET /api/sync/progress/:jobId': 'SSE progress stream'
    },
    activeJobs: syncJobs.size
  });
});

// POST /api/sync/start - Start a background sync job
router.post('/start', async (req, res) => {
  const { from, to, mode = 'full' } = req.body;
  
  if (!from || !to) {
    return res.status(400).json({ error: 'from and to required (ISO NY datetime)' });
  }
  
  try {
    // Create sync log
    const syncLog = await createSyncLog(from, to, mode);
    
    // Create job
    const jobId = uuidv4();
    const job = {
      id: jobId,
      syncId: syncLog.sync_id,
      syncLog,
      fromUtc: nyToUtcEpoch(from),
      toUtc: nyToUtcEpoch(to),
      mode,
      status: 'pending',
      progress: {},
      startedAt: new Date()
    };
    
    syncJobs.set(jobId, job);
    
    // Start processing in background
    setImmediate(() => processSyncJob(jobId));
    
    res.json({
      success: true,
      jobId,
      syncId: syncLog.sync_id,
      message: 'Sync job started in background',
      status: 'pending'
    });
  } catch (error) {
    console.error('Failed to start sync:', error);
    res.status(500).json({ error: 'Failed to start sync', details: error.message });
  }
});

// GET /api/sync/status/:jobId - Get sync job status
router.get('/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = syncJobs.get(jobId);
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  res.json({
    jobId: job.id,
    syncId: job.syncLog.sync_id,
    status: job.status,
    progress: job.progress,
    result: job.result,
    error: job.error,
    startedAt: job.startedAt
  });
});

// GET /api/sync/logs - Get sync logs history
router.get('/logs', async (req, res) => {
  const { limit = 10, offset = 0 } = req.query;
  
  try {
    const query = `
      SELECT * FROM sync_summary_view
      ORDER BY started_at DESC
      LIMIT $1 OFFSET $2;
    `;
    
    const result = await pool.query(query, [limit, offset]);
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch sync logs:', error);
    res.status(500).json({ error: 'Failed to fetch sync logs' });
  }
});

// GET /api/sync/logs/:syncId/details - Get detailed sync log
router.get('/logs/:syncId/details', async (req, res) => {
  const { syncId } = req.params;
  const { status, limit = 100, offset = 0 } = req.query;
  
  try {
    let query = `
      SELECT * FROM sync_log_details
      WHERE sync_id = $1
    `;
    
    const params = [syncId];
    
    if (status) {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }
    
    query += ` ORDER BY processed_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch sync details:', error);
    res.status(500).json({ error: 'Failed to fetch sync details' });
  }
});

// POST /api/sync/retry/:syncId - Retry failed calls from a sync
router.post('/retry/:syncId', async (req, res) => {
  const { syncId } = req.params;
  
  try {
    // Get failed sync details
    const failedQuery = `
      SELECT * FROM sync_log_details
      WHERE sync_id = $1 AND status = 'failed' AND retry_count < 3
      ORDER BY processed_at ASC;
    `;
    
    const failedResult = await pool.query(failedQuery, [syncId]);
    const failedCalls = failedResult.rows;
    
    if (failedCalls.length === 0) {
      return res.json({ message: 'No failed calls to retry', retried: 0 });
    }
    
    let retriedCount = 0;
    let successCount = 0;
    
    for (const detail of failedCalls) {
      if (!detail.raw_data) continue;
      
      try {
        const call = typeof detail.raw_data === 'string' 
          ? JSON.parse(detail.raw_data) 
          : detail.raw_data;
        await insertCall(call, syncId);
        if (call.recording_details) {
          await insertRecording(call.call_id, call.recording_details);
        }
        await logSyncDetail(syncId, call.call_id, detail.page_number, 'success');
        successCount++;
      } catch (error) {
        console.error(`Retry failed for call ${detail.call_id}:`, error.message);
        await logSyncDetail(syncId, detail.call_id, detail.page_number, 'failed', error.message);
      }
      retriedCount++;
    }
    
    // Update sync log
    const updateQuery = `
      UPDATE sync_logs
      SET inserted_count = inserted_count + $1,
          failed_count = failed_count - $1
      WHERE sync_id = $2;
    `;
    
    await pool.query(updateQuery, [successCount, syncId]);
    
    res.json({
      success: true,
      retriedCount,
      successCount,
      stillFailedCount: retriedCount - successCount
    });
  } catch (error) {
    console.error('Retry failed:', error);
    res.status(500).json({ error: 'Failed to retry', details: error.message });
  }
});

// SSE endpoint for real-time progress
router.get('/progress/:jobId', (req, res) => {
  const { jobId } = req.params;
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  
  const sendUpdate = () => {
    const job = syncJobs.get(jobId);
    if (!job) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Job not found' })}\n\n`);
      res.end();
      return;
    }
    
    res.write(`data: ${JSON.stringify({
      type: 'progress',
      status: job.status,
      progress: job.progress,
      result: job.result,
      error: job.error
    })}\n\n`);
    
    if (job.status === 'completed' || job.status === 'failed') {
      res.end();
    } else {
      setTimeout(sendUpdate, 1000); // Update every second
    }
  };
  
  sendUpdate();
});

// Quick sync endpoint
router.get('/download-quick', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: 'from and to required (ISO NY datetime)' });
  }

  try {
    const syncLog = await createSyncLog(from, to, 'quick');
    const startedAfter = nyToUtcEpoch(from);
    const startedBefore = nyToUtcEpoch(to);
    const startTime = Date.now();
    
    const rateLimiter = new RateLimiter(15, 1000);
    await rateLimiter.waitIfNeeded();
    
    const params = new URLSearchParams({
      limit: '50',
      started_after: startedAfter.toString(),
      started_before: startedBefore.toString(),
    });
    
    const response = await axios.get('https://dialpad.com/api/v2/call', {
      headers: {
        'Authorization': `Bearer ${process.env.DIALPAD_TOKEN}`,
        'Accept': 'application/json',
      },
      params,
      timeout: 30000,
    });
    
    const { items } = response.data;
    let insertedCount = 0;
    let failedCount = 0;
    
    if (items && items.length > 0) {
      for (const call of items) {
        try {
          await insertCall(call, syncLog.sync_id);
          if (call.recording_details) {
            await insertRecording(call.call_id, call.recording_details);
          }
          await logSyncDetail(syncLog.sync_id, call.call_id, 1, 'success', null, JSON.stringify(call));
          insertedCount++;
        } catch (error) {
          await logSyncDetail(syncLog.sync_id, call.call_id, 1, 'failed', error.message, JSON.stringify(call));
          failedCount++;
        }
      }
    }
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    await updateSyncLog(syncLog.sync_id, {
      status: failedCount > 0 ? 'partial' : 'completed',
      total_calls: items?.length || 0,
      total_pages: 1,
      inserted_count: insertedCount,
      failed_count: failedCount,
      duration_seconds: duration
    });

    res.json({
      success: true,
      syncId: syncLog.sync_id,
      totalCalls: items?.length || 0,
      inserted: insertedCount,
      failed: failedCount,
      message: `Quick sync completed: ${insertedCount} inserted, ${failedCount} failed`,
      hasMore: items?.length === 50
    });
  } catch (err) {
    console.error('Quick sync error:', err);
    res.status(500).json({ error: 'Failed to sync', details: err.message });
  }
});

module.exports = router;