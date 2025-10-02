const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { formatDurationMs } = require('../utils/formatters');

// GET /api/stats/users - Get user statistics
router.get('/users', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const result = await pool.query(`
      SELECT 
        u.name AS user,
        COUNT(c.call_id) AS calls,
        COALESCE(SUM(c.duration / 1000), 0) AS total_duration_seconds,
        COALESCE(AVG(c.duration / 1000), 0) AS avg_duration_seconds,
        COUNT(CASE WHEN c.direction = 'outbound' AND c.state = 'completed' THEN 1 END) AS placed,
        COUNT(CASE WHEN c.direction = 'inbound' AND c.state = 'completed' THEN 1 END) AS answered,
        COUNT(CASE WHEN (c.state = 'missed' OR (c.state = 'hangup' AND c.duration = 0)) THEN 1 END) AS missed_total,
        COUNT(CASE WHEN (c.state = 'missed' OR (c.state = 'hangup' AND c.duration = 0)) AND c.date_connected IS NULL THEN 1 END) AS missed_ring_no_answer,
        COUNT(CASE WHEN c.state = 'rejected' THEN 1 END) AS missed_rejected,
        COUNT(CASE WHEN c.state = 'cancelled' THEN 1 END) AS cancelled,
        COUNT(CASE WHEN c.state = 'abandoned' THEN 1 END) AS abandoned
      FROM calls c
      LEFT JOIN users u ON c.target_id = u.id
      WHERE u.id IS NOT NULL
      GROUP BY u.id, u.name
      ORDER BY calls DESC
      LIMIT $1
    `, [limit]);
    
    const formattedRows = result.rows.map(row => ({
      ...row,
      total_duration: formatDurationMs(row.total_duration_seconds * 1000),
      avg_duration: formatDurationMs(row.avg_duration_seconds * 1000)
    }));
    
    res.json(formattedRows);
  } catch (err) {
    console.error('Query error:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// GET /api/stats/summary - Get overall call summary
router.get('/summary', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) AS total_calls,
        COUNT(DISTINCT contact_id) AS unique_contacts,
        COUNT(DISTINCT target_id) AS unique_users,
        AVG(duration / 1000) AS avg_duration_seconds,
        SUM(duration / 1000) AS total_duration_seconds,
        COUNT(CASE WHEN state = 'completed' THEN 1 END) AS completed_calls,
        COUNT(CASE WHEN state = 'missed' THEN 1 END) AS missed_calls,
        COUNT(CASE WHEN was_recorded = true THEN 1 END) AS recorded_calls
      FROM calls
    `);
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Query error:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

module.exports = router;