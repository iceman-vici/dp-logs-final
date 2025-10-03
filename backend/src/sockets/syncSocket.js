const { pool } = require('../config/database');

// Store active sync watchers
const syncWatchers = new Map();
// Store active detail watchers
const detailWatchers = new Map();

function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    // Join sync logs room for real-time updates
    socket.on('join-sync-logs', () => {
      socket.join('sync-logs');
      console.log(`Client ${socket.id} joined sync-logs room`);
      
      // Send initial sync logs
      sendInitialSyncLogs(socket);
      
      // Start watching all active syncs
      startWatchingActiveSyncs(io);
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
      
      // Also start watching details for real-time updates
      if (!detailWatchers.has(syncId)) {
        startWatchingDetails(io, syncId);
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
        stopWatchingDetails(syncId);
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

// Start watching all active syncs
async function startWatchingActiveSyncs(io) {
  try {
    const query = `
      SELECT sync_id FROM sync_logs
      WHERE status = 'in_progress'
    `;
    
    const result = await pool.query(query);
    
    for (const row of result.rows) {
      if (!syncWatchers.has(row.sync_id)) {
        startWatchingSync(io, row.sync_id);
      }
    }
  } catch (error) {
    console.error('Error starting active sync watchers:', error);
  }
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
        if (syncLog.status === 'completed' || syncLog.status === 'failed' || syncLog.status === 'partial') {
          // Get final details
          const details = await getSyncDetails(syncId, null, 500);
          io.to(`sync-${syncId}`).emit('sync-completed', {
            syncLog,
            details
          });
          
          // Stop watching after a delay to ensure final updates are sent
          setTimeout(() => {
            stopWatchingSync(syncId);
            stopWatchingDetails(syncId);
          }, 5000);
        }
      }
    } catch (error) {
      console.error(`Error watching sync ${syncId}:`, error);
    }
  }, 1000); // Poll every 1 second for faster updates
  
  syncWatchers.set(syncId, interval);
}

// Start watching details for a specific sync
function startWatchingDetails(io, syncId) {
  const interval = setInterval(async () => {
    try {
      // Get latest failed and success counts
      const statusQuery = `
        SELECT 
          status,
          COUNT(*) as count
        FROM sync_log_details
        WHERE sync_id = $1
        GROUP BY status
      `;
      
      const statusResult = await pool.query(statusQuery, [syncId]);
      
      // Get recent details
      const recentQuery = `
        SELECT * FROM sync_log_details
        WHERE sync_id = $1
        ORDER BY processed_at DESC
        LIMIT 50
      `;
      
      const recentResult = await pool.query(recentQuery, [syncId]);
      
      // Emit details update
      io.to(`sync-${syncId}`).emit('sync-details-update', {
        syncId,
        statusCounts: statusResult.rows,
        recentDetails: recentResult.rows
      });
      
    } catch (error) {
      console.error(`Error watching details for sync ${syncId}:`, error);
    }
  }, 2000); // Poll every 2 seconds for details
  
  detailWatchers.set(syncId, interval);
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

// Stop watching details
function stopWatchingDetails(syncId) {
  const interval = detailWatchers.get(syncId);
  if (interval) {
    clearInterval(interval);
    detailWatchers.delete(syncId);
    console.log(`Stopped watching details for sync ${syncId}`);
  }
}

// Broadcast sync log update to all clients
function broadcastSyncUpdate(io, syncLog) {
  io.to('sync-logs').emit('sync-log-updated', syncLog);
  
  // If it's a new in_progress sync, start watching it
  if (syncLog.status === 'in_progress' && !syncWatchers.has(syncLog.sync_id)) {
    startWatchingSync(io, syncLog.sync_id);
  }
}

// Broadcast new sync started
function broadcastNewSync(io, syncLog) {
  io.to('sync-logs').emit('new-sync-started', syncLog);
  
  // Start watching the new sync
  if (!syncWatchers.has(syncLog.sync_id)) {
    startWatchingSync(io, syncLog.sync_id);
  }
}

// Broadcast real-time progress
function broadcastProgress(io, syncId, progress) {
  io.to(`sync-${syncId}`).emit('sync-progress', {
    syncId,
    progress
  });
}

module.exports = {
  setupSocketHandlers,
  broadcastSyncUpdate,
  broadcastNewSync,
  broadcastProgress
};