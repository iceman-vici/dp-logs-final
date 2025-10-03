const { pool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

/**
 * Webhook Service
 * Handles incoming Dialpad webhook calls and stores them in the database
 */
class WebhookService {
  constructor() {
    this.webhookStats = {
      total: 0,
      success: 0,
      failed: 0
    };
  }

  /**
   * Process incoming webhook data
   * @param {Object} webhookData - The webhook payload
   * @returns {Object} Processing result
   */
  async processWebhook(webhookData) {
    console.log('[WebhookService] Processing webhook data');
    
    try {
      this.webhookStats.total++;
      
      // Extract call data from webhook
      const callData = this.extractCallData(webhookData);
      
      if (!callData) {
        console.error('[WebhookService] No valid call data in webhook');
        this.webhookStats.failed++;
        return {
          success: false,
          error: 'No valid call data in webhook payload'
        };
      }

      // Transform call data to match our database schema
      const transformedCall = this.transformCallData(callData);
      
      // Insert or update the call in database
      await this.upsertCall(transformedCall);
      
      // Log webhook processing
      await this.logWebhookEvent(transformedCall.call_id, 'success', webhookData);
      
      this.webhookStats.success++;
      
      console.log(`[WebhookService] Successfully processed call ${transformedCall.call_id}`);
      
      return {
        success: true,
        call_id: transformedCall.call_id,
        message: 'Call data processed successfully'
      };
      
    } catch (error) {
      console.error('[WebhookService] Error processing webhook:', error);
      this.webhookStats.failed++;
      
      // Try to log the failure
      try {
        await this.logWebhookEvent(
          webhookData?.call?.id || 'unknown',
          'failed',
          webhookData,
          error.message
        );
      } catch (logError) {
        console.error('[WebhookService] Error logging webhook failure:', logError);
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Extract call data from webhook payload
   * Handles different webhook payload structures
   */
  extractCallData(webhookData) {
    // Webhook might have different structures
    // Try different common structures
    
    if (webhookData.call) {
      return webhookData.call;
    }
    
    if (webhookData.data && webhookData.data.call) {
      return webhookData.data.call;
    }
    
    if (webhookData.event && webhookData.event.call) {
      return webhookData.event.call;
    }
    
    // If the payload itself is the call data
    if (webhookData.id || webhookData.call_id) {
      return webhookData;
    }
    
    return null;
  }

  /**
   * Transform webhook call data to match database schema
   */
  transformCallData(callData) {
    // Extract contact information
    const contact = callData.contact || {};
    const target = callData.target || {};
    
    // Handle recordings
    const recordings = callData.recordings || [];
    const recording = recordings.length > 0 ? recordings[0] : null;
    
    return {
      call_id: callData.id || callData.call_id,
      contact_id: contact.id || null,
      target_id: target.id || null,
      date_started: callData.date_started || callData.start_time,
      date_rang: callData.date_rang || null,
      date_connected: callData.date_connected || null,
      date_ended: callData.date_ended || callData.end_time,
      direction: callData.direction || 'unknown',
      duration: callData.duration || 0,
      total_duration: callData.total_duration || callData.duration || 0,
      state: callData.state || 'completed',
      external_number: callData.external_number || callData.from_number || null,
      internal_number: callData.internal_number || callData.to_number || null,
      is_transferred: callData.is_transferred || false,
      was_recorded: callData.was_recorded || (recordings.length > 0),
      mos_score: callData.mos_score || null,
      group_id: callData.group_id || null,
      entry_point_call_id: callData.entry_point_call_id || null,
      master_call_id: callData.master_call_id || null,
      event_timestamp: callData.event_timestamp || Date.now(),
      transcription_text: callData.transcription?.text || null,
      voicemail_link: callData.voicemail?.url || null,
      voicemail_recording_id: callData.voicemail?.recording_id || null,
      // Contact info
      contact_name: contact.name || null,
      contact_email: contact.email || null,
      contact_phone: contact.phone || null,
      // Target info
      target_name: target.name || null,
      target_email: target.email || null,
      target_phone: target.phone || null,
      // Recording info
      recording_id: recording?.id || null,
      recording_url: recording?.url || null,
      recording_duration: recording?.duration || null
    };
  }

  /**
   * Insert or update call in database
   */
  async upsertCall(call) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Upsert contact if present
      if (call.contact_id) {
        await this.upsertContact(client, {
          id: call.contact_id,
          name: call.contact_name,
          email: call.contact_email,
          phone: call.contact_phone
        });
      }
      
      // Upsert user/target if present
      if (call.target_id) {
        await this.upsertUser(client, {
          id: call.target_id,
          name: call.target_name,
          email: call.target_email,
          phone: call.target_phone
        });
      }
      
      // Insert/update the call
      const callQuery = `
        INSERT INTO calls (
          call_id,
          contact_id,
          target_id,
          date_started,
          date_rang,
          date_connected,
          date_ended,
          direction,
          duration,
          total_duration,
          state,
          external_number,
          internal_number,
          is_transferred,
          was_recorded,
          mos_score,
          group_id,
          entry_point_call_id,
          master_call_id,
          event_timestamp,
          transcription_text,
          voicemail_link,
          voicemail_recording_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23
        )
        ON CONFLICT (call_id) DO UPDATE SET
          contact_id = EXCLUDED.contact_id,
          target_id = EXCLUDED.target_id,
          date_started = EXCLUDED.date_started,
          date_rang = EXCLUDED.date_rang,
          date_connected = EXCLUDED.date_connected,
          date_ended = EXCLUDED.date_ended,
          direction = EXCLUDED.direction,
          duration = EXCLUDED.duration,
          total_duration = EXCLUDED.total_duration,
          state = EXCLUDED.state,
          external_number = EXCLUDED.external_number,
          internal_number = EXCLUDED.internal_number,
          is_transferred = EXCLUDED.is_transferred,
          was_recorded = EXCLUDED.was_recorded,
          mos_score = EXCLUDED.mos_score,
          group_id = EXCLUDED.group_id,
          entry_point_call_id = EXCLUDED.entry_point_call_id,
          master_call_id = EXCLUDED.master_call_id,
          event_timestamp = EXCLUDED.event_timestamp,
          transcription_text = EXCLUDED.transcription_text,
          voicemail_link = EXCLUDED.voicemail_link,
          voicemail_recording_id = EXCLUDED.voicemail_recording_id,
          updated_at = CURRENT_TIMESTAMP;
      `;
      
      await client.query(callQuery, [
        call.call_id,
        call.contact_id,
        call.target_id,
        call.date_started,
        call.date_rang,
        call.date_connected,
        call.date_ended,
        call.direction,
        call.duration,
        call.total_duration,
        call.state,
        call.external_number,
        call.internal_number,
        call.is_transferred,
        call.was_recorded,
        call.mos_score,
        call.group_id,
        call.entry_point_call_id,
        call.master_call_id,
        call.event_timestamp,
        call.transcription_text,
        call.voicemail_link,
        call.voicemail_recording_id
      ]);
      
      // Insert recording details if present
      if (call.recording_id && call.recording_url) {
        await this.upsertRecording(client, {
          id: call.recording_id,
          call_id: call.call_id,
          duration: call.recording_duration,
          url: call.recording_url,
          recording_type: 'call',
          start_time: call.date_started
        });
      }
      
      await client.query('COMMIT');
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Upsert contact
   */
  async upsertContact(client, contact) {
    if (!contact.id) return;
    
    const query = `
      INSERT INTO contacts (id, name, email, phone, type)
      VALUES ($1, $2, $3, $4, 'external')
      ON CONFLICT (id) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, contacts.name),
        email = COALESCE(EXCLUDED.email, contacts.email),
        phone = COALESCE(EXCLUDED.phone, contacts.phone),
        updated_at = CURRENT_TIMESTAMP;
    `;
    
    await client.query(query, [
      contact.id,
      contact.name,
      contact.email,
      contact.phone
    ]);
  }

  /**
   * Upsert user/target
   */
  async upsertUser(client, user) {
    if (!user.id) return;
    
    const query = `
      INSERT INTO users (id, name, email, phone, type)
      VALUES ($1, $2, $3, $4, 'internal')
      ON CONFLICT (id) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, users.name),
        email = COALESCE(EXCLUDED.email, users.email),
        phone = COALESCE(EXCLUDED.phone, users.phone),
        updated_at = CURRENT_TIMESTAMP;
    `;
    
    await client.query(query, [
      user.id,
      user.name,
      user.email,
      user.phone
    ]);
  }

  /**
   * Upsert recording
   */
  async upsertRecording(client, recording) {
    if (!recording.id || !recording.call_id) return;
    
    const query = `
      INSERT INTO recording_details (
        id, call_id, duration, recording_type, start_time, url
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        duration = EXCLUDED.duration,
        recording_type = EXCLUDED.recording_type,
        start_time = EXCLUDED.start_time,
        url = EXCLUDED.url,
        updated_at = CURRENT_TIMESTAMP;
    `;
    
    await client.query(query, [
      recording.id,
      recording.call_id,
      recording.duration,
      recording.recording_type,
      recording.start_time,
      recording.url
    ]);
  }

  /**
   * Log webhook event to database
   */
  async logWebhookEvent(callId, status, payload, errorMessage = null) {
    // Create a webhook_logs table if it doesn't exist
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS webhook_logs (
        id SERIAL PRIMARY KEY,
        call_id VARCHAR(255),
        status VARCHAR(50),
        error_message TEXT,
        payload JSONB,
        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    
    try {
      await pool.query(createTableQuery);
      
      const insertQuery = `
        INSERT INTO webhook_logs (call_id, status, error_message, payload)
        VALUES ($1, $2, $3, $4);
      `;
      
      await pool.query(insertQuery, [
        callId,
        status,
        errorMessage,
        JSON.stringify(payload)
      ]);
    } catch (error) {
      console.error('[WebhookService] Error logging webhook event:', error);
      // Don't throw - logging failure shouldn't break the webhook processing
    }
  }

  /**
   * Get webhook statistics
   */
  getStats() {
    return {
      ...this.webhookStats,
      successRate: this.webhookStats.total > 0 
        ? ((this.webhookStats.success / this.webhookStats.total) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.webhookStats = {
      total: 0,
      success: 0,
      failed: 0
    };
  }

  /**
   * Get recent webhook logs
   */
  async getRecentLogs(limit = 50) {
    try {
      const query = `
        SELECT * FROM webhook_logs
        ORDER BY processed_at DESC
        LIMIT $1;
      `;
      
      const result = await pool.query(query, [limit]);
      return result.rows;
    } catch (error) {
      console.error('[WebhookService] Error fetching webhook logs:', error);
      return [];
    }
  }
}

module.exports = new WebhookService();
