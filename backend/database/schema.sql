-- Dialpad Logs Database Schema
-- PostgreSQL Database Setup

-- Create database (run this separately if needed)
-- CREATE DATABASE dialpad_logs;

-- Connect to the database
-- \c dialpad_logs;

-- Drop existing tables if they exist (be careful with this in production)
DROP VIEW IF EXISTS calls_view CASCADE;
DROP TABLE IF EXISTS sync_log_details CASCADE;
DROP TABLE IF EXISTS sync_logs CASCADE;
DROP TABLE IF EXISTS recording_details CASCADE;
DROP TABLE IF EXISTS calls CASCADE;
DROP TABLE IF EXISTS contacts CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Create contacts table
CREATE TABLE contacts (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255),
    name VARCHAR(255),
    phone VARCHAR(50),
    type VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create users table
CREATE TABLE users (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255),
    name VARCHAR(255),
    phone VARCHAR(50),
    type VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create sync_logs table (header for sync operations)
CREATE TABLE sync_logs (
    id SERIAL PRIMARY KEY,
    sync_id UUID DEFAULT gen_random_uuid() UNIQUE,
    date_from TIMESTAMP NOT NULL,
    date_to TIMESTAMP NOT NULL,
    date_from_ny VARCHAR(50) NOT NULL, -- NY timezone string for reference
    date_to_ny VARCHAR(50) NOT NULL, -- NY timezone string for reference
    sync_mode VARCHAR(20) NOT NULL, -- 'quick' or 'full'
    status VARCHAR(20) NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'completed', 'failed', 'partial'
    total_calls INTEGER DEFAULT 0,
    total_pages INTEGER DEFAULT 0,
    inserted_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    duration_seconds INTEGER,
    error_message TEXT,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create sync_log_details table (individual call sync attempts)
CREATE TABLE sync_log_details (
    id SERIAL PRIMARY KEY,
    sync_id UUID REFERENCES sync_logs(sync_id) ON DELETE CASCADE,
    call_id VARCHAR(255) NOT NULL,
    page_number INTEGER,
    status VARCHAR(20) NOT NULL, -- 'success', 'failed', 'retry_pending'
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    raw_data JSONB, -- Store the raw API response for retry
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create calls table with sync reference
CREATE TABLE calls (
    call_id VARCHAR(255) PRIMARY KEY,
    sync_id UUID REFERENCES sync_logs(sync_id),
    contact_id VARCHAR(255) REFERENCES contacts(id),
    target_id VARCHAR(255) REFERENCES users(id),
    date_started BIGINT,
    date_rang BIGINT,
    date_connected BIGINT,
    date_ended BIGINT,
    direction VARCHAR(50),
    duration FLOAT,
    total_duration FLOAT,
    state VARCHAR(50),
    external_number VARCHAR(50),
    internal_number VARCHAR(50),
    is_transferred BOOLEAN DEFAULT FALSE,
    was_recorded BOOLEAN DEFAULT FALSE,
    mos_score FLOAT,
    group_id VARCHAR(255),
    entry_point_call_id VARCHAR(255),
    master_call_id VARCHAR(255),
    event_timestamp BIGINT,
    transcription_text TEXT,
    voicemail_link TEXT,
    voicemail_recording_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create recording_details table
CREATE TABLE recording_details (
    id VARCHAR(255) PRIMARY KEY,
    call_id VARCHAR(255) REFERENCES calls(call_id) ON DELETE CASCADE,
    duration FLOAT,
    recording_type VARCHAR(50),
    start_time BIGINT,
    url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX idx_calls_date_started ON calls(date_started DESC);
CREATE INDEX idx_calls_contact_id ON calls(contact_id);
CREATE INDEX idx_calls_target_id ON calls(target_id);
CREATE INDEX idx_calls_direction ON calls(direction);
CREATE INDEX idx_calls_state ON calls(state);
CREATE INDEX idx_calls_sync_id ON calls(sync_id);
CREATE INDEX idx_recording_call_id ON recording_details(call_id);
CREATE INDEX idx_sync_logs_status ON sync_logs(status);
CREATE INDEX idx_sync_logs_dates ON sync_logs(date_from, date_to);
CREATE INDEX idx_sync_log_details_sync_id ON sync_log_details(sync_id);
CREATE INDEX idx_sync_log_details_call_id ON sync_log_details(call_id);
CREATE INDEX idx_sync_log_details_status ON sync_log_details(status);

-- Create a view for easier querying with formatted timestamps
CREATE OR REPLACE VIEW calls_view AS
SELECT 
    c.*,
    ct.name AS contact_name,
    ct.email AS contact_email,
    ct.phone AS contact_phone,
    u.name AS target_name,
    u.email AS target_email,
    u.phone AS target_phone,
    sl.date_from_ny,
    sl.date_to_ny,
    sl.sync_mode,
    sl.started_at AS sync_started_at,
    to_timestamp(c.date_started / 1000) AS started_at,
    to_timestamp(c.date_ended / 1000) AS ended_at,
    CASE 
        WHEN c.date_rang IS NOT NULL THEN to_timestamp(c.date_rang / 1000)
        ELSE NULL
    END AS rang_at,
    CASE 
        WHEN c.date_connected IS NOT NULL THEN to_timestamp(c.date_connected / 1000)
        ELSE NULL
    END AS connected_at
FROM calls c
LEFT JOIN contacts ct ON c.contact_id = ct.id
LEFT JOIN users u ON c.target_id = u.id
LEFT JOIN sync_logs sl ON c.sync_id = sl.sync_id;

-- Create view for failed sync details that need retry
CREATE OR REPLACE VIEW failed_sync_details_view AS
SELECT 
    sld.*,
    sl.date_from,
    sl.date_to,
    sl.date_from_ny,
    sl.date_to_ny
FROM sync_log_details sld
JOIN sync_logs sl ON sld.sync_id = sl.sync_id
WHERE sld.status = 'failed' 
  AND sld.retry_count < 3
ORDER BY sld.processed_at DESC;

-- Create view for sync summary
CREATE OR REPLACE VIEW sync_summary_view AS
SELECT 
    sl.*,
    COUNT(DISTINCT sld.call_id) AS unique_call_attempts,
    COUNT(CASE WHEN sld.status = 'success' THEN 1 END) AS success_details,
    COUNT(CASE WHEN sld.status = 'failed' THEN 1 END) AS failed_details,
    COUNT(CASE WHEN sld.status = 'retry_pending' THEN 1 END) AS pending_retries
FROM sync_logs sl
LEFT JOIN sync_log_details sld ON sl.sync_id = sld.sync_id
GROUP BY sl.id, sl.sync_id, sl.date_from, sl.date_to, sl.date_from_ny, sl.date_to_ny, 
         sl.sync_mode, sl.status, sl.total_calls, sl.total_pages, sl.inserted_count, 
         sl.failed_count, sl.duration_seconds, sl.error_message, sl.started_at, 
         sl.completed_at, sl.created_by, sl.created_at;

-- Function to retry failed sync details
CREATE OR REPLACE FUNCTION retry_failed_sync_details(sync_id_param UUID)
RETURNS TABLE (
    retried_count INTEGER,
    success_count INTEGER,
    still_failed_count INTEGER
) AS $$
DECLARE
    v_retried_count INTEGER := 0;
    v_success_count INTEGER := 0;
    v_still_failed_count INTEGER := 0;
BEGIN
    -- This is a placeholder for the retry logic
    -- Actual retry logic would be implemented in the application
    
    -- Update retry count for failed items
    UPDATE sync_log_details
    SET retry_count = retry_count + 1,
        status = 'retry_pending'
    WHERE sync_id = sync_id_param
      AND status = 'failed'
      AND retry_count < 3;
    
    GET DIAGNOSTICS v_retried_count = ROW_COUNT;
    
    RETURN QUERY SELECT v_retried_count, v_success_count, v_still_failed_count;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions (adjust as needed)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_db_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_db_user;

-- Add comments for documentation
COMMENT ON TABLE sync_logs IS 'Main table for tracking sync operations from Dialpad API';
COMMENT ON TABLE sync_log_details IS 'Detailed log of each call sync attempt, including failures for retry';
COMMENT ON TABLE calls IS 'Main table storing all call records from Dialpad';
COMMENT ON TABLE contacts IS 'Stores contact information for call participants';
COMMENT ON TABLE users IS 'Stores internal user information';
COMMENT ON TABLE recording_details IS 'Stores recording details associated with calls';
COMMENT ON VIEW calls_view IS 'Comprehensive view of calls with joined contact and user information';
COMMENT ON VIEW failed_sync_details_view IS 'View of failed sync attempts that need retry';
COMMENT ON VIEW sync_summary_view IS 'Summary view of sync operations with statistics';