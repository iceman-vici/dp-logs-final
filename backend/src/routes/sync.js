const express = require('express');
const router = express.Router();
const axios = require('axios');
const { pool } = require('../config/database');
const { zonedTimeToUtc } = require('date-fns-tz');
const { formatDurationMs } = require('../utils/formatters');

// Helper: NY ISO to UTC ms epoch
function nyToUtcEpoch(nyIsoString) {
  const nyTz = 'America/New_York';
  const nyDate = new Date(nyIsoString);
  const utcDate = zonedTimeToUtc(nyDate, nyTz);
  return utcDate.getTime();
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

// Helper: Insert call
async function insertCall(call) {
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
      call_id, contact_id, target_id, date_started, date_rang, date_connected, date_ended,
      direction, duration, total_duration, state, external_number, internal_number,
      is_transferred, was_recorded, mos_score, group_id, entry_point_call_id,
      master_call_id, event_timestamp, transcription_text, voicemail_link,
      voicemail_recording_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
    ON CONFLICT (call_id) DO UPDATE SET
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
    call_id, contact.id, target?.id || null,
    parseInt(date_started), parseInt(date_rang) || null, parseInt(date_connected) || null, parseInt(date_ended) || null,
    direction, parseFloat(duration), parseFloat(total_duration) || null, state, external_number, internal_number,
    is_transferred || false, was_recorded || false, parseFloat(mos_score) || null, group_id || null,
    entry_point_call_id || null, master_call_id || null, parseInt(event_timestamp),
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
    await pool.query(query, [id, call_id, rec_duration, recording_type, parseInt(start_time), url]);
  }
}

// Helper: Rate limiter
class RateLimiter {
  constructor(maxRequests = 20, windowMs = 1000) {
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

// SSE endpoint for full sync with streaming updates
router.get('/download-stream', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: 'from and to required (ISO NY datetime)' });
  }

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no' // Disable Nginx buffering
  });

  // Send initial connection message
  const sendMessage = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Keep connection alive
  const keepAliveInterval = setInterval(() => {
    res.write(':keep-alive\n\n');
  }, 30000); // Send keep-alive every 30 seconds

  const startedAfter = nyToUtcEpoch(from);
  const startedBefore = nyToUtcEpoch(to);
  const startTime = Date.now();
  
  sendMessage({ type: 'info', message: `Starting sync for range: ${from} to ${to} (NY Time)` });
  sendMessage({ type: 'info', message: 'Using streaming connection to prevent timeouts...' });

  const rateLimiter = new RateLimiter(15, 1000);
  const allCalls = [];
  let cursor = null;
  let pageCount = 0;
  let totalInserted = 0;
  let totalFailed = 0;
  const errors = [];

  try {
    // Fetch phase
    sendMessage({ type: 'progress', message: 'Starting to fetch calls from Dialpad API...' });
    
    while (true) {
      await rateLimiter.waitIfNeeded();
      
      const params = new URLSearchParams({
        limit: '50',
        started_after: startedAfter.toString(),
        started_before: startedBefore.toString(),
      });
      
      if (cursor) {
        params.append('cursor', cursor);
      }
      
      sendMessage({ type: 'progress', message: `Fetching page ${pageCount + 1}...` });
      
      try {
        const response = await axios.get('https://dialpad.com/api/v2/call', {
          headers: {
            'Authorization': `Bearer ${process.env.DIALPAD_TOKEN}`,
            'Accept': 'application/json',
          },
          params,
          timeout: 30000,
        });
        
        if (response.data.error) {
          throw new Error(`Dialpad API error: ${JSON.stringify(response.data.error)}`);
        }
        
        const { items, cursor: nextCursor } = response.data;
        
        if (!items || !Array.isArray(items) || items.length === 0) {
          sendMessage({ type: 'info', message: 'No more calls to fetch.' });
          break;
        }
        
        allCalls.push(...items);
        sendMessage({ 
          type: 'success', 
          message: `Fetched ${items.length} calls from page ${pageCount + 1}. Total so far: ${allCalls.length}` 
        });
        
        pageCount++;
        
        if (nextCursor && nextCursor !== cursor) {
          cursor = nextCursor;
        } else {
          break;
        }
      } catch (error) {
        if (error.code === 'ECONNABORTED' || error.response?.status === 429) {
          sendMessage({ type: 'warning', message: 'Rate limit hit, waiting 5 seconds...' });
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }
        throw error;
      }
    }
    
    // Insert phase
    if (allCalls.length === 0) {
      sendMessage({ type: 'success', message: 'No calls found in the specified date range.' });
      sendMessage({ type: 'complete', result: { success: true, inserted: 0, failed: 0, totalCalls: 0 } });
    } else {
      sendMessage({ type: 'info', message: `Starting to insert ${allCalls.length} calls into database...` });
      
      // Process in batches
      const batchSize = 25;
      for (let i = 0; i < allCalls.length; i += batchSize) {
        const batch = allCalls.slice(i, Math.min(i + batchSize, allCalls.length));
        const batchEnd = Math.min(i + batchSize, allCalls.length);
        
        sendMessage({ 
          type: 'progress', 
          message: `Processing batch: calls ${i + 1} to ${batchEnd} of ${allCalls.length}` 
        });
        
        for (const call of batch) {
          try {
            await insertCall(call);
            if (call.recording_details) {
              await insertRecording(call.call_id, call.recording_details);
            }
            totalInserted++;
          } catch (error) {
            console.error(`Failed to insert call ${call.call_id}:`, error.message);
            totalFailed++;
            errors.push({ call_id: call.call_id, error: error.message });
          }
        }
        
        // Send progress update
        sendMessage({ 
          type: 'progress', 
          message: `Progress: ${totalInserted} inserted, ${totalFailed} failed out of ${allCalls.length} total`,
          progress: Math.round((i + batchSize) / allCalls.length * 100)
        });
      }
      
      const duration = Math.round((Date.now() - startTime) / 1000);
      
      sendMessage({ 
        type: 'success', 
        message: `Sync completed in ${duration} seconds: ${totalInserted} inserted, ${totalFailed} failed` 
      });
      
      sendMessage({ 
        type: 'complete', 
        result: {
          success: true,
          totalCalls: allCalls.length,
          inserted: totalInserted,
          failed: totalFailed,
          duration: `${duration} seconds`,
          errors: errors.length <= 10 ? errors : undefined,
          errorSummary: errors.length > 10 ? `${errors.length} calls failed to insert.` : undefined
        }
      });
    }
  } catch (error) {
    console.error('Stream sync error:', error);
    sendMessage({ 
      type: 'error', 
      message: `Sync failed: ${error.message}` 
    });
    sendMessage({ 
      type: 'complete', 
      result: {
        success: false,
        error: error.message
      }
    });
  } finally {
    clearInterval(keepAliveInterval);
    res.end();
  }
});

// Original download endpoint (kept for backwards compatibility)
router.get('/download', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: 'from and to required (ISO NY datetime)' });
  }

  // For full sync, redirect to streaming endpoint
  res.json({
    success: true,
    message: 'Please use the streaming endpoint for full sync to avoid timeouts',
    useStreaming: true
  });
});

// Quick download endpoint (no changes needed)
router.get('/download-quick', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: 'from and to required (ISO NY datetime)' });
  }

  const startedAfter = nyToUtcEpoch(from);
  const startedBefore = nyToUtcEpoch(to);
  console.log(`Quick download params: started_after=${startedAfter}, started_before=${startedBefore}`);

  let totalInserted = 0;

  try {
    const rateLimiter = new RateLimiter(15, 1000);
    await rateLimiter.waitIfNeeded();
    
    const params = new URLSearchParams({
      limit: '50',
      started_after: startedAfter.toString(),
      started_before: startedBefore.toString(),
    });
    
    console.log('Fetching first 50 calls only (quick sync)...');
    
    const response = await axios.get('https://dialpad.com/api/v2/call', {
      headers: {
        'Authorization': `Bearer ${process.env.DIALPAD_TOKEN}`,
        'Accept': 'application/json',
      },
      params,
      timeout: 30000,
    });
    
    const { items } = response.data;
    
    if (!items || items.length === 0) {
      return res.json({ 
        success: true, 
        inserted: 0, 
        message: 'No calls found in the specified date range',
        isQuickSync: true
      });
    }

    console.log(`Quick sync: Inserting ${items.length} calls...`);

    for (const call of items) {
      try {
        await insertCall(call);
        if (call.recording_details) {
          await insertRecording(call.call_id, call.recording_details);
        }
        totalInserted++;
      } catch (error) {
        console.error(`Failed to insert call ${call.call_id}:`, error.message);
      }
    }

    res.json({
      success: true,
      totalCalls: items.length,
      inserted: totalInserted,
      message: `Quick sync completed: ${totalInserted} calls inserted (first 50 only)`,
      isQuickSync: true,
      hasMore: items.length === 50
    });
  } catch (err) {
    console.error('Quick download error:', err.response?.data || err.message);
    res.status(500).json({ 
      error: 'Failed to download calls', 
      details: err.response?.data || err.message 
    });
  }
});

module.exports = router;