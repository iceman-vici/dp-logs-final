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

// Helper: Fetch calls from Dialpad with pagination
async function fetchCallsFromDialpad(startedAfter, startedBefore, limit = 50, maxPages = 100) {
  const allCalls = [];
  let cursor = null;
  let pageCount = 0;
  
  console.log(`Starting to fetch calls from Dialpad...`);
  
  while (pageCount < maxPages) {
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        started_after: startedAfter.toString(),
        started_before: startedBefore.toString(),
      });
      
      // Add cursor if we have one from previous page
      if (cursor) {
        params.append('cursor', cursor);
      }
      
      console.log(`Fetching page ${pageCount + 1}, cursor: ${cursor || 'none'}`);
      
      const response = await axios.get('https://dialpad.com/api/v2/call', {
        headers: {
          'Authorization': `Bearer ${process.env.DIALPAD_TOKEN}`,
          'Accept': 'application/json',
        },
        params,
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
      allCalls.push(...items);
      
      // Check if there's a next page
      if (nextCursor && nextCursor !== cursor) {
        cursor = nextCursor;
        pageCount++;
        
        // Add a small delay to respect rate limits (1200 per minute = 20 per second)
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
      } else {
        // No more pages
        console.log('No more pages available.');
        break;
      }
    } catch (error) {
      console.error(`Error fetching page ${pageCount + 1}:`, error.message);
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

  let totalInserted = 0;
  let totalFailed = 0;
  const errors = [];

  try {
    // Fetch all calls with pagination
    const allCalls = await fetchCallsFromDialpad(startedAfter, startedBefore);
    
    if (allCalls.length === 0) {
      return res.json({ 
        success: true, 
        inserted: 0, 
        message: 'No calls found in the specified date range' 
      });
    }

    console.log(`Starting to insert ${allCalls.length} calls into database...`);

    // Process all calls
    for (const call of allCalls) {
      try {
        await insertCall(call);
        if (call.recording_details) {
          await insertRecording(call.call_id, call.recording_details);
        }
        totalInserted++;
        
        // Log progress every 10 calls
        if (totalInserted % 10 === 0) {
          console.log(`Progress: ${totalInserted}/${allCalls.length} calls inserted`);
        }
      } catch (error) {
        console.error(`Failed to insert call ${call.call_id}:`, error.message);
        totalFailed++;
        errors.push({ 
          call_id: call.call_id, 
          error: error.message 
        });
      }
    }

    console.log(`Completed: ${totalInserted} inserted, ${totalFailed} failed`);

    const response = {
      success: true,
      totalCalls: allCalls.length,
      inserted: totalInserted,
      failed: totalFailed,
      message: `Successfully downloaded and inserted ${totalInserted} out of ${allCalls.length} calls`
    };

    // Include error details if there were failures
    if (errors.length > 0 && errors.length <= 10) {
      response.errors = errors;
    } else if (errors.length > 10) {
      response.errorSummary = `${errors.length} calls failed to insert. Check server logs for details.`;
    }

    res.json(response);
  } catch (err) {
    console.error('Download error:', err.response?.data || err.message);
    res.status(500).json({ 
      error: 'Failed to download calls', 
      details: err.response?.data || err.message 
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
    // Fetch only first page (50 calls max)
    const allCalls = await fetchCallsFromDialpad(startedAfter, startedBefore, 50, 1);
    
    if (allCalls.length === 0) {
      return res.json({ 
        success: true, 
        inserted: 0, 
        message: 'No calls found in the specified date range',
        isQuickSync: true
      });
    }

    console.log(`Quick sync: Inserting ${allCalls.length} calls...`);

    // Process calls
    for (const call of allCalls) {
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
      totalCalls: allCalls.length,
      inserted: totalInserted,
      message: `Quick sync completed: ${totalInserted} calls inserted (first 50 only)`,
      isQuickSync: true,
      hasMore: allCalls.length === 50 // Indicates there might be more calls
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