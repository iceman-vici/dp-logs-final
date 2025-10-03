-- Migration: Add webhook_logs table
-- Description: Creates a table to track webhook event processing
-- Date: 2025-10-03

-- Create webhook_logs table
CREATE TABLE IF NOT EXISTS webhook_logs (
    id SERIAL PRIMARY KEY,
    call_id VARCHAR(255),
    status VARCHAR(50) NOT NULL,
    error_message TEXT,
    payload JSONB,
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_webhook_logs_call_id ON webhook_logs(call_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_status ON webhook_logs(status);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_processed_at ON webhook_logs(processed_at DESC);

-- Add comments for documentation
COMMENT ON TABLE webhook_logs IS 'Logs all webhook events received from Dialpad with processing status';
COMMENT ON COLUMN webhook_logs.call_id IS 'The call ID from the webhook payload';
COMMENT ON COLUMN webhook_logs.status IS 'Processing status: success, failed, etc.';
COMMENT ON COLUMN webhook_logs.error_message IS 'Error message if processing failed';
COMMENT ON COLUMN webhook_logs.payload IS 'Full webhook payload as JSON for debugging';
COMMENT ON COLUMN webhook_logs.processed_at IS 'Timestamp when the webhook was processed';

-- Create a view for webhook statistics
CREATE OR REPLACE VIEW webhook_stats_view AS
SELECT 
    COUNT(*) as total_webhooks,
    COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_webhooks,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_webhooks,
    ROUND(
        (COUNT(CASE WHEN status = 'success' THEN 1 END)::numeric / 
         NULLIF(COUNT(*)::numeric, 0) * 100), 2
    ) as success_rate_percent,
    MIN(processed_at) as first_webhook_at,
    MAX(processed_at) as latest_webhook_at,
    DATE(processed_at) as webhook_date
FROM webhook_logs
GROUP BY DATE(processed_at)
ORDER BY webhook_date DESC;

-- Create a view for recent webhook activity
CREATE OR REPLACE VIEW webhook_recent_activity AS
SELECT 
    wl.id,
    wl.call_id,
    wl.status,
    wl.error_message,
    wl.processed_at,
    c.direction,
    c.duration,
    c.state as call_state,
    c.external_number,
    c.internal_number
FROM webhook_logs wl
LEFT JOIN calls c ON wl.call_id = c.call_id
ORDER BY wl.processed_at DESC
LIMIT 100;

COMMENT ON VIEW webhook_stats_view IS 'Daily statistics for webhook processing';
COMMENT ON VIEW webhook_recent_activity IS 'Recent webhook activity with call details';

-- Function to cleanup old webhook logs (optional - keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_webhook_logs(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM webhook_logs
    WHERE processed_at < NOW() - (days_to_keep || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_webhook_logs IS 'Cleanup webhook logs older than specified days (default 30 days)';

-- Example usage:
-- SELECT cleanup_old_webhook_logs(30); -- Delete logs older than 30 days
-- SELECT * FROM webhook_stats_view; -- View daily webhook statistics
-- SELECT * FROM webhook_recent_activity; -- View recent webhook activity
