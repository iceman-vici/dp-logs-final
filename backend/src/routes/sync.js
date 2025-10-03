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
    this.maxRequests = maxRequests; // 20 requests per second (well under 1200/min limit)
    this.windowMs = windowMs;
    this.requests = [];
  }

  async waitIfNeeded() {
    const now = Date.now();
    // Remove old requests outside the window
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    if (this.requests.length >= this.maxRequests) {
      // Calculate wait time
      const oldestRequest = this.requests[0];
      const waitTime = this.windowMs - (now - oldestRequest) + 100; // Add 100ms buffer
      console.log(`Rate limit reached, waiting ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      // Recursive call to check again
      return this.waitIfNeeded();
    }
    
    this.requests.push(now);
  }
}

// Helper: Fetch calls from Dialpad with pagination and batching
async function fetchCallsFromDialpad(startedAfter, startedBefore, limit = 50, maxPages = 100) {
  const rateLimiter = new RateLimiter(15, 1000); // 15 requests per second to be safe
  const allCalls = [];
  let cursor = null;
  let pageCount = 0;
  const batchSize = 5; // Process 5 pages at a time then insert to DB
  let currentBatch = [];
  
  console.log(`Starting to fetch calls from Dialpad...`);
  console.log(`Rate limit: 15 requests/second (900/minute, well under 1200/min limit)`);
  
  while (pageCount < maxPages) {
    try {
      // Wait if needed for rate limiting
      await rateLimiter.waitIfNeeded();
      
      const params = new URLSearchParams({
        limit: limit.toString(),
        started_after: startedAfter.toString(),
        started_before: startedBefore.toString(),
      });
      
      // Add cursor if we have one from previous page
      if (cursor) {
        params.append('cursor', cursor);
      }
      
      console.log(`Fetching page ${pageCount + 1}, cursor: ${cursor ? cursor.substring(0, 20) + '...' : 'none'}`);
      
      const response = await axios.get('https://dialpad.com/api/v2/call', {
        headers: {
          'Authorization': `Bearer ${process.env.DIALPAD_TOKEN}`,
          'Accept': 'application/json',
        },
        params,
        timeout: 30000, // 30 second timeout per request
      });
      
      if (response.data.error) {
        throw new Error(`Dialpad API error: ${JSON.stringify(response.data.error)}`);
      }
      
      const { items, cursor: nextCursor } = response.data;
      
      if (!items || !Array.isArray(items) || items.length === 0) {
        console.log('No more calls to fetch.');
        break;
      }
      
      console.log(`Fetched ${items.length} calls on page ${pageCount + 1}`);
      currentBatch.push(...items);
      allCalls.push(...items);
      
      // Process batch if we've reached batch size or it's the last page
      if (currentBatch.length >= batchSize * limit || !nextCursor) {
        console.log(`Batch of ${currentBatch.length} calls ready for processing`);
        currentBatch = []; // Clear the batch
        
        // Add a small pause between batches
        if (nextCursor) {
          console.log('Pausing between batches...');
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second pause between batches
        }
      }
      
      // Check if there's a next page
      if (nextCursor && nextCursor !== cursor) {
        cursor = nextCursor;
        pageCount++;
      } else {
        // No more pages
        console.log('No more pages available.');
        break;
      }
    } catch (error) {
      console.error(`Error fetching page ${pageCount + 1}:`, error.message);
      
      // If it's a timeout or rate limit error, wait and retry
      if (error.code === 'ECONNABORTED' || error.response?.status === 429) {
        console.log('Request timeout or rate limit hit, waiting 5 seconds before retry...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue; // Retry the same page
      }
      
      throw error;
    }
  }
  
  console.log(`Total calls fetched: ${allCalls.length} across ${pageCount + 1} page(s)`);
  return allCalls;
}

// GET /api/sync/download - Download and insert ALL calls from Dialpad with pagination
router.get('/download', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: 'from and to required (ISO NY datetime)' });
  }

  const startedAfter = nyToUtcEpoch(from);
  const startedBefore = nyToUtcEpoch(to);
  console.log(`Download params: started_after=${startedAfter}, started_before=${startedBefore}`);
  console.log(`Date range: ${from} to ${to} (NY Time)`);

  let totalInserted = 0;
  let totalFailed = 0;
  const errors = [];
  const startTime = Date.now();

  try {
    // Fetch all calls with pagination and rate limiting
    const allCalls = await fetchCallsFromDialpad(startedAfter, startedBefore);
    
    if (allCalls.length === 0) {
      return res.json({ 
        success: true, 
        inserted: 0, 
        message: 'No calls found in the specified date range' 
      });
    }

    console.log(`Starting to insert ${allCalls.length} calls into database...`);
    console.log('Processing in batches to avoid timeouts...');

    // Process calls in smaller batches to avoid timeout
    const insertBatchSize = 25;
    for (let i = 0; i < allCalls.length; i += insertBatchSize) {
      const batch = allCalls.slice(i, Math.min(i + insertBatchSize, allCalls.length));
      console.log(`Processing batch: calls ${i + 1} to ${Math.min(i + insertBatchSize, allCalls.length)}`);
      
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
          errors.push({ 
            call_id: call.call_id, 
            error: error.message 
          });
        }
      }
      
      // Log progress
      console.log(`Progress: ${totalInserted}/${allCalls.length} calls inserted, ${totalFailed} failed`);
      
      // Small pause between insert batches
      if (i + insertBatchSize < allCalls.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);
    console.log(`Completed in ${duration} seconds: ${totalInserted} inserted, ${totalFailed} failed`);

    const response = {
      success: true,
      totalCalls: allCalls.length,
      inserted: totalInserted,
      failed: totalFailed,
      duration: `${duration} seconds`,
      message: `Successfully downloaded and inserted ${totalInserted} out of ${allCalls.length} calls in ${duration} seconds`
    };

    // Include error details if there were failures
    if (errors.length > 0 && errors.length <= 10) {
      response.errors = errors;
    } else if (errors.length > 10) {
      response.errorSummary = `${errors.length} calls failed to insert. Check server logs for details.`;
    }

    res.json(response);
  } catch (err) {
    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);
    console.error(`Download error after ${duration} seconds:`, err.response?.data || err.message);
    res.status(500).json({ 
      error: 'Failed to download calls', 
      details: err.response?.data || err.message,
      duration: `${duration} seconds`
    });
  }
});

// GET /api/sync/download-quick - Quick download (first 50 calls only)
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
    // Fetch only first page (50 calls max) - no pagination needed
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

    // Process calls
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
      hasMore: items.length === 50 // Indicates there might be more calls
    });
  } catch (err) {
    console.error('Quick download error:', err.response?.data || err.message);
    res.status(500).json({ 
      error: 'Failed to download calls', 
      details: err.response?.data || err.message 
    });
  }
});

// GET /api/sync/download-page - Download a single page of calls (for testing)
router.get('/download-page', async (req, res) => {
  const { from, to, cursor, limit = 50 } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: 'from and to required (ISO NY datetime)' });
  }

  const startedAfter = nyToUtcEpoch(from);
  const startedBefore = nyToUtcEpoch(to);

  try {
    const params = new URLSearchParams({
      limit: limit.toString(),
      started_after: startedAfter.toString(),
      started_before: startedBefore.toString(),
    });
    
    if (cursor) {
      params.append('cursor', cursor);
    }

    const response = await axios.get('https://dialpad.com/api/v2/call', {
      headers: {
        'Authorization': `Bearer ${process.env.DIALPAD_TOKEN}`,
        'Accept': 'application/json',
      },
      params,
      timeout: 30000,
    });

    res.json({
      success: true,
      data: response.data,
      itemCount: response.data.items?.length || 0,
      nextCursor: response.data.cursor || null
    });
  } catch (err) {
    console.error('API error:', err.response?.data || err.message);
    res.status(500).json({ 
      error: 'Failed to fetch page', 
      details: err.response?.data || err.message 
    });
  }
});

module.exports = router;