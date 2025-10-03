const express = require('express');
const router = express.Router();
const webhookService = require('../services/webhookService');
const { 
  verifyWebhookSignature, 
  logWebhookRequest 
} = require('../middleware/webhookAuth');

/**
 * POST /webhook
 * Main webhook endpoint for receiving Dialpad call events
 * 
 * This endpoint:
 * 1. Verifies JWT signature from Dialpad
 * 2. Processes the call data
 * 3. Stores it in the database
 * 
 * Expected webhook configuration:
 * {
 *   "hook_url": "https://your-domain.com/webhook",
 *   "id": "webhook_id",
 *   "signature": {
 *     "algo": "HS256",
 *     "secret": "dp_call_logs",
 *     "type": "jwt"
 *   }
 * }
 */
router.post('/', 
  logWebhookRequest,
  verifyWebhookSignature,
  async (req, res) => {
    try {
      console.log('[Webhook] Received call event');
      
      // The body contains the call data
      const webhookData = req.body;
      
      // Validate that we have data
      if (!webhookData || Object.keys(webhookData).length === 0) {
        console.error('[Webhook] Empty webhook payload');
        return res.status(400).json({
          success: false,
          error: 'Empty webhook payload'
        });
      }

      // Log the event type if available
      if (webhookData.event_type) {
        console.log(`[Webhook] Event type: ${webhookData.event_type}`);
      }

      // Process the webhook
      const result = await webhookService.processWebhook(webhookData);
      
      if (result.success) {
        console.log(`[Webhook] Successfully processed call ${result.call_id}`);
        
        return res.status(200).json({
          success: true,
          message: result.message,
          call_id: result.call_id
        });
      } else {
        console.error('[Webhook] Failed to process webhook:', result.error);
        
        return res.status(500).json({
          success: false,
          error: result.error
        });
      }
      
    } catch (error) {
      console.error('[Webhook] Unexpected error:', error);
      
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'production' 
          ? 'Failed to process webhook' 
          : error.message
      });
    }
  }
);

/**
 * GET /webhook/stats
 * Get webhook processing statistics
 */
router.get('/stats', (req, res) => {
  try {
    const stats = webhookService.getStats();
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('[Webhook] Error getting stats:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve statistics'
    });
  }
});

/**
 * POST /webhook/stats/reset
 * Reset webhook statistics
 */
router.post('/stats/reset', (req, res) => {
  try {
    webhookService.resetStats();
    
    res.json({
      success: true,
      message: 'Statistics reset successfully'
    });
  } catch (error) {
    console.error('[Webhook] Error resetting stats:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to reset statistics'
    });
  }
});

/**
 * GET /webhook/logs
 * Get recent webhook logs
 */
router.get('/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const logs = await webhookService.getRecentLogs(limit);
    
    res.json({
      success: true,
      count: logs.length,
      logs
    });
  } catch (error) {
    console.error('[Webhook] Error getting logs:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve logs'
    });
  }
});

/**
 * GET /webhook/health
 * Health check endpoint for the webhook
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    stats: webhookService.getStats()
  });
});

/**
 * POST /webhook/test
 * Test endpoint for webhook (no authentication required)
 * Use this to test your webhook without JWT signature
 */
router.post('/test', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({
      error: 'Test endpoint not available in production'
    });
  }

  try {
    console.log('[Webhook] Test webhook received');
    console.log('[Webhook] Test data:', JSON.stringify(req.body, null, 2));
    
    const result = await webhookService.processWebhook(req.body);
    
    res.json({
      success: true,
      test: true,
      result
    });
  } catch (error) {
    console.error('[Webhook] Test error:', error);
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
