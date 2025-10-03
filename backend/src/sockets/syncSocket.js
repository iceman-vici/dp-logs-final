const { pool } = require('../config/database');

// Store active sync watchers
const syncWatchers = new Map();

function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    // Join sync logs room for real-time updates
    socket.on('join-sync-logs', () => {
      socket.join('sync-logs');
      console.log(`Client ${socket.id} joined sync-logs room`);
      
      // Send initial sync logs
      sendInitialSyncLogs(socket);
    });
    
    // Leave sync logs room
    socket.on('leave-sync-logs', () => {
      socket.leave('sync-logs');
      console.log(`Client ${socket.id} left sync-logs room`);
    });
    
    // Watch specific sync job
    socket.on('watch-sync', (syncId) => {
      socket.join(`sync-${syncId}`);
      console.log(`Client ${socket.id} watching sync ${syncId}`);
      
      // Start polling for this sync if not already watching
      if (!syncWatchers.has(syncId)) {
        startWatchingSync(io, syncId);
      }
    });
    
    // Stop watching specific sync job
    socket.on('unwatch-sync', (syncId) => {
      socket.leave(`sync-${syncId}`);
      console.log(`Client ${socket.id} stopped watching sync ${syncId}`);
      
      // Check if anyone is still watching
      const room = io.sockets.adapter.rooms.get(`sync-${syncId}`);
      if (!room || room.size === 0) {
        stopWatchingSync(syncId);
      }
    });
    
    // Request sync logs refresh
    socket.on('refresh-sync-logs', () => {
      sendInitialSyncLogs(socket);
    });
    
    // Request specific sync details
    socket.on('get-sync-details', async (data) => {
      const { syncId, status, limit = 100 } = data;
      try {
        const details = await getSyncDetails(syncId, status, limit);
        socket.emit('sync-details', { syncId, details });
      } catch (error) {
        socket.emit('sync-error', { error: error.message });
      }
    });
    
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
}

// Send initial sync logs to a socket
async function sendInitialSyncLogs(socket) {
  try {
    const query = `
      SELECT * FROM sync_summary_view
      ORDER BY started_at DESC
      LIMIT 20;
    `;
    
    const result = await pool.query(query);
    socket.emit('sync-logs-update', result.rows);
  } catch (error) {
    console.error('Failed to send initial sync logs:', error);
    socket.emit('sync-error', { error: error.message });
  }
}

// Get sync details
async function getSyncDetails(syncId, status = null, limit = 100) {
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

// Start watching a specific sync
function startWatchingSync(io, syncId) {
  const interval = setInterval(async () => {
    try {
      // Get updated sync log
      const syncQuery = `
        SELECT * FROM sync_summary_view
        WHERE sync_id = $1
        LIMIT 1;
      `;
      
      const syncResult = await pool.query(syncQuery, [syncId]);
      
      if (syncResult.rows.length > 0) {
        const syncLog = syncResult.rows[0];
        
        // Emit to all clients watching this sync
        io.to(`sync-${syncId}`).emit('sync-update', syncLog);
        
        // Also update the main sync logs room
        io.to('sync-logs').emit('sync-log-updated', syncLog);
        
        // If sync is completed or failed, stop watching
        if (syncLog.status === 'completed' || syncLog.status === 'failed') {
          stopWatchingSync(syncId);
          
          // Get final details
          const details = await getSyncDetails(syncId, null, 500);
          io.to(`sync-${syncId}`).emit('sync-completed', {
            syncLog,
            details
          });
        }
      }
    } catch (error) {
      console.error(`Error watching sync ${syncId}:`, error);
    }
  }, 2000); // Poll every 2 seconds
  
  syncWatchers.set(syncId, interval);
}

// Stop watching a sync
function stopWatchingSync(syncId) {
  const interval = syncWatchers.get(syncId);
  if (interval) {
    clearInterval(interval);
    syncWatchers.delete(syncId);
    console.log(`Stopped watching sync ${syncId}`);
  }
}

// Broadcast sync log update to all clients
function broadcastSyncUpdate(io, syncLog) {
  io.to('sync-logs').emit('sync-log-updated', syncLog);
}

// Broadcast new sync started
function broadcastNewSync(io, syncLog) {
  io.to('sync-logs').emit('new-sync-started', syncLog);
}

module.exports = {
  setupSocketHandlers,
  broadcastSyncUpdate,
  broadcastNewSync
};