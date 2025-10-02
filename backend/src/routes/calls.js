const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { formatDurationMs } = require('../utils/formatters');

// GET /api/calls - Get recent calls
router.get('/', async (req, res) => {
  try {
    const { limit = 10, offset = 0 } = req.query;
    const result = await pool.query(
      'SELECT * FROM calls_view ORDER BY started_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    
    const formattedRows = result.rows.map(row => ({
      ...row,
      duration_formatted: formatDurationMs(row.duration),
      total_duration_formatted: formatDurationMs(row.total_duration)
    }));
    
    res.json(formattedRows);
  } catch (err) {
    console.error('Query error:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// GET /api/calls/:id - Get specific call by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM calls_view WHERE call_id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Call not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Query error:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

module.exports = router;