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

// GET /api/sync/download - Download and insert calls from Dialpad
router.get('/download', async (req, res) => {
  const { from, to, limit = 50 } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: 'from and to required (ISO NY datetime)' });
  }

  const startedAfter = nyToUtcEpoch(from);
  const startedBefore = nyToUtcEpoch(to);
  console.log(`Download params: started_after=${startedAfter}, started_before=${startedBefore}, limit=${limit}`);

  let totalInserted = 0;

  try {
    const params = new URLSearchParams({
      limit: limit.toString(),
      started_after: startedAfter.toString(),
      started_before: startedBefore.toString(),
    });

    const response = await axios.get('https://dialpad.com/api/v2/call', {
      headers: {
        'Authorization': `Bearer ${process.env.DIALPAD_TOKEN}`,
        'Accept': 'application/json',
      },
      params,
    });

    console.log('API Response keys:', Object.keys(response.data));

    if (response.data.error) {
      return res.status(400).json({ error: 'Dialpad API error', details: response.data.error });
    }

    const { items } = response.data;

    if (!items || !Array.isArray(items)) {
      console.log('No items array in response.');
      return res.json({ success: true, inserted: 0, message: 'No calls found in range' });
    }

    console.log(`Found ${items.length} calls to insert.`);

    for (const item of items) {
      await insertCall(item);
      if (item.recording_details) {
        await insertRecording(item.call_id, item.recording_details);
      }
      totalInserted++;
      console.log(`Inserted call: ${item.call_id}`);
    }

    res.json({ success: true, inserted: totalInserted, message: `Downloaded & inserted ${totalInserted} calls` });
  } catch (err) {
    console.error('Download error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Download failed', details: err.response?.data || err.message });
  }
});

module.exports = router;
