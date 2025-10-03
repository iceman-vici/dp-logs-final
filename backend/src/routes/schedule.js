const express = require('express');
const router = express.Router();
const cron = require('node-cron');

// GET /api/schedule - Get all schedules
router.get('/', async (req, res) => {
  try {
    const scheduler = req.app.get('scheduler');
    const schedules = await scheduler.getSchedules();
    res.json(schedules);
  } catch (error) {
    console.error('Failed to fetch schedules:', error);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

// POST /api/schedule - Create new schedule
router.post('/', async (req, res) => {
  try {
    const scheduler = req.app.get('scheduler');
    const schedule = await scheduler.upsertSchedule(req.body);
    
    // Broadcast to WebSocket clients
    const io = req.app.get('io');
    if (io) {
      io.emit('schedule-updated', schedule);
    }
    
    res.json(schedule);
  } catch (error) {
    console.error('Failed to create schedule:', error);
    res.status(500).json({ error: 'Failed to create schedule' });
  }
});

// PUT /api/schedule/:id - Update schedule
router.put('/:id', async (req, res) => {
  try {
    const scheduler = req.app.get('scheduler');
    const schedule = await scheduler.upsertSchedule({
      ...req.body,
      id: parseInt(req.params.id)
    });
    
    // Broadcast to WebSocket clients
    const io = req.app.get('io');
    if (io) {
      io.emit('schedule-updated', schedule);
    }
    
    res.json(schedule);
  } catch (error) {
    console.error('Failed to update schedule:', error);
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

// DELETE /api/schedule/:id - Delete schedule
router.delete('/:id', async (req, res) => {
  try {
    const scheduler = req.app.get('scheduler');
    await scheduler.deleteSchedule(parseInt(req.params.id));
    
    // Broadcast to WebSocket clients
    const io = req.app.get('io');
    if (io) {
      io.emit('schedule-deleted', { id: parseInt(req.params.id) });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete schedule:', error);
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

// POST /api/schedule/:id/trigger - Manually trigger a schedule
router.post('/:id/trigger', async (req, res) => {
  try {
    const scheduler = req.app.get('scheduler');
    const result = await scheduler.triggerManualRun(parseInt(req.params.id));
    
    // Broadcast to WebSocket clients
    const io = req.app.get('io');
    if (io) {
      io.emit('schedule-triggered', { 
        id: parseInt(req.params.id),
        message: 'Manual run triggered' 
      });
    }
    
    res.json(result);
  } catch (error) {
    console.error('Failed to trigger schedule:', error);
    res.status(500).json({ error: 'Failed to trigger schedule' });
  }
});

// GET /api/schedule/validate-cron - Validate cron expression
router.post('/validate-cron', (req, res) => {
  const { expression } = req.body;
  
  if (!expression) {
    return res.status(400).json({ valid: false, error: 'Expression required' });
  }
  
  const isValid = cron.validate(expression);
  
  if (isValid) {
    // Parse cron expression to human-readable format
    const parts = expression.split(' ');
    let description = 'Runs ';
    
    // Simple parsing for common patterns
    if (expression === '0 2 * * *') {
      description = 'Daily at 2:00 AM';
    } else if (expression === '0 0 * * *') {
      description = 'Daily at midnight';
    } else if (expression === '0 0 * * 0') {
      description = 'Weekly on Sunday at midnight';
    } else if (expression === '0 0 1 * *') {
      description = 'Monthly on the 1st at midnight';
    } else if (parts[0] === '0' && parts[1] !== '*') {
      description = `Daily at ${parts[1]}:00`;
    } else if (parts[0] !== '*' && parts[1] !== '*') {
      description = `At ${parts[1]}:${parts[0]}`;
    } else {
      description = 'Custom schedule';
    }
    
    res.json({ valid: true, description });
  } else {
    res.json({ valid: false, error: 'Invalid cron expression' });
  }
});

// GET /api/schedule/presets - Get cron presets
router.get('/presets', (req, res) => {
  const presets = [
    { label: 'Every Hour', value: '0 * * * *', description: 'Runs at the start of every hour' },
    { label: 'Daily at Midnight', value: '0 0 * * *', description: 'Runs every day at 12:00 AM' },
    { label: 'Daily at 2 AM', value: '0 2 * * *', description: 'Runs every day at 2:00 AM' },
    { label: 'Daily at 6 AM', value: '0 6 * * *', description: 'Runs every day at 6:00 AM' },
    { label: 'Daily at Noon', value: '0 12 * * *', description: 'Runs every day at 12:00 PM' },
    { label: 'Daily at 6 PM', value: '0 18 * * *', description: 'Runs every day at 6:00 PM' },
    { label: 'Weekly on Monday', value: '0 0 * * 1', description: 'Runs every Monday at midnight' },
    { label: 'Weekly on Friday', value: '0 0 * * 5', description: 'Runs every Friday at midnight' },
    { label: 'Monthly on 1st', value: '0 0 1 * *', description: 'Runs on the 1st of every month' },
    { label: 'Every 15 Minutes', value: '*/15 * * * *', description: 'Runs every 15 minutes' },
    { label: 'Every 30 Minutes', value: '*/30 * * * *', description: 'Runs every 30 minutes' },
    { label: 'Business Days at 9 AM', value: '0 9 * * 1-5', description: 'Monday to Friday at 9:00 AM' },
    { label: 'Business Days at 5 PM', value: '0 17 * * 1-5', description: 'Monday to Friday at 5:00 PM' },
  ];
  
  res.json(presets);
});

module.exports = router;