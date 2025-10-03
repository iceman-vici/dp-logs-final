-- Add schedule configuration table
CREATE TABLE IF NOT EXISTS sync_schedules (
    id SERIAL PRIMARY KEY,
    schedule_name VARCHAR(100) NOT NULL,
    cron_expression VARCHAR(100) NOT NULL,
    sync_type VARCHAR(20) NOT NULL DEFAULT 'full', -- 'full' or 'quick'
    date_range_type VARCHAR(20) NOT NULL DEFAULT 'previous_day', -- 'previous_day', 'last_x_days', 'custom'
    date_range_value INTEGER DEFAULT 1, -- Number of days to sync
    is_active BOOLEAN DEFAULT true,
    timezone VARCHAR(50) DEFAULT 'America/New_York',
    last_run_at TIMESTAMP,
    last_run_status VARCHAR(20),
    last_run_sync_id UUID,
    next_run_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    description TEXT
);

-- Add schedule history table
CREATE TABLE IF NOT EXISTS sync_schedule_history (
    id SERIAL PRIMARY KEY,
    schedule_id INTEGER REFERENCES sync_schedules(id) ON DELETE CASCADE,
    sync_id UUID REFERENCES sync_logs(sync_id),
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20),
    error_message TEXT,
    date_from TIMESTAMP,
    date_to TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sync_schedules_active ON sync_schedules(is_active);
CREATE INDEX IF NOT EXISTS idx_sync_schedules_next_run ON sync_schedules(next_run_at);
CREATE INDEX IF NOT EXISTS idx_sync_schedule_history_schedule_id ON sync_schedule_history(schedule_id);
CREATE INDEX IF NOT EXISTS idx_sync_schedule_history_executed_at ON sync_schedule_history(executed_at DESC);

-- Insert default daily schedule (runs at 2 AM NY time every day)
INSERT INTO sync_schedules (
    schedule_name,
    cron_expression,
    sync_type,
    date_range_type,
    date_range_value,
    is_active,
    timezone,
    description
) VALUES (
    'Daily Sync - Previous Day',
    '0 2 * * *',  -- 2:00 AM every day
    'full',
    'previous_day',
    1,
    true,
    'America/New_York',
    'Automatically sync previous day''s calls at 2 AM NY time'
) ON CONFLICT DO NOTHING;

-- Function to calculate next run time
CREATE OR REPLACE FUNCTION update_next_run_time()
RETURNS TRIGGER AS $$
BEGIN
    -- This is a placeholder - actual cron calculation happens in Node.js
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at
CREATE TRIGGER update_sync_schedules_updated_at
BEFORE UPDATE ON sync_schedules
FOR EACH ROW
EXECUTE FUNCTION update_next_run_time();

-- View for schedule status
CREATE OR REPLACE VIEW sync_schedules_view AS
SELECT 
    ss.*,
    sl.status as last_sync_status,
    sl.total_calls as last_sync_total_calls,
    sl.inserted_count as last_sync_inserted_count,
    sl.failed_count as last_sync_failed_count,
    sl.duration_seconds as last_sync_duration,
    (
        SELECT COUNT(*) 
        FROM sync_schedule_history 
        WHERE schedule_id = ss.id
    ) as total_runs,
    (
        SELECT COUNT(*) 
        FROM sync_schedule_history 
        WHERE schedule_id = ss.id AND status = 'completed'
    ) as successful_runs,
    (
        SELECT COUNT(*) 
        FROM sync_schedule_history 
        WHERE schedule_id = ss.id AND status = 'failed'
    ) as failed_runs
FROM sync_schedules ss
LEFT JOIN sync_logs sl ON ss.last_run_sync_id = sl.sync_id;

-- Add comments
COMMENT ON TABLE sync_schedules IS 'Stores scheduled sync configurations';
COMMENT ON TABLE sync_schedule_history IS 'History of scheduled sync executions';
COMMENT ON COLUMN sync_schedules.cron_expression IS 'Cron expression for scheduling (e.g., "0 2 * * *" for 2 AM daily)';
COMMENT ON COLUMN sync_schedules.date_range_type IS 'Type of date range to sync: previous_day, last_x_days, or custom';