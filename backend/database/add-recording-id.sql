-- Add recording_id column to call_logs table
ALTER TABLE call_logs 
ADD COLUMN IF NOT EXISTS recording_id VARCHAR(255);

-- Add index for recording_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_call_logs_recording_id 
ON call_logs(recording_id) 
WHERE recording_id IS NOT NULL;

-- Update the view to include recording_id
DROP VIEW IF EXISTS call_logs_view CASCADE;

CREATE OR REPLACE VIEW call_logs_view AS
SELECT 
    cl.*,
    -- Format timestamps to NY timezone for display
    TO_CHAR(cl.date_started AT TIME ZONE 'America/New_York', 'MM/DD/YYYY HH24:MI:SS') as date_started_ny_formatted,
    TO_CHAR(cl.date_rang AT TIME ZONE 'America/New_York', 'MM/DD/YYYY HH24:MI:SS') as date_rang_ny_formatted,
    TO_CHAR(cl.date_connected AT TIME ZONE 'America/New_York', 'MM/DD/YYYY HH24:MI:SS') as date_connected_ny_formatted,
    TO_CHAR(cl.date_ended AT TIME ZONE 'America/New_York', 'MM/DD/YYYY HH24:MI:SS') as date_ended_ny_formatted,
    -- Calculate call status based on state
    CASE 
        WHEN cl.state = 'connected' THEN 'Completed'
        WHEN cl.state = 'missed' THEN 'Missed'
        WHEN cl.state = 'voicemail' THEN 'Voicemail'
        ELSE cl.state
    END as call_status,
    -- Extract hour of day for analytics
    EXTRACT(HOUR FROM cl.date_started AT TIME ZONE 'America/New_York') as hour_of_day,
    -- Extract day of week (0 = Sunday, 6 = Saturday)
    EXTRACT(DOW FROM cl.date_started AT TIME ZONE 'America/New_York') as day_of_week,
    -- Add recording status
    CASE 
        WHEN cl.recording_id IS NOT NULL THEN true
        ELSE cl.was_recorded
    END as has_recording
FROM call_logs cl;

-- Create a view for calls with recordings
CREATE OR REPLACE VIEW calls_with_recordings AS
SELECT 
    cl.call_id,
    cl.external_number,
    cl.contact_name,
    cl.target_name,
    cl.recording_id,
    cl.was_recorded,
    cl.voicemail_link,
    cl.transcription_text,
    cl.date_started,
    cl.date_ended,
    cl.duration,
    cl.state,
    cl.direction
FROM call_logs cl
WHERE cl.recording_id IS NOT NULL 
   OR cl.was_recorded = true 
   OR cl.voicemail_link IS NOT NULL
ORDER BY cl.date_started DESC;

-- Add comment for documentation
COMMENT ON COLUMN call_logs.recording_id IS 'Unique identifier for the call recording from Dialpad API';

-- Function to generate recording URL from recording_id
CREATE OR REPLACE FUNCTION get_recording_url(p_recording_id VARCHAR)
RETURNS VARCHAR AS $$
BEGIN
    IF p_recording_id IS NULL THEN
        RETURN NULL;
    END IF;
    -- Return the recording API endpoint URL
    -- This will be used by the backend to fetch the actual recording
    RETURN 'https://dialpad.com/api/v2/recordings/' || p_recording_id;
END;
$$ LANGUAGE plpgsql;

-- Update statistics view to include recording stats
CREATE OR REPLACE VIEW call_statistics AS
SELECT
    COUNT(*) as total_calls,
    COUNT(DISTINCT target_email) as unique_users,
    COUNT(CASE WHEN was_recorded = true OR recording_id IS NOT NULL THEN 1 END) as recorded_calls,
    COUNT(CASE WHEN state = 'connected' THEN 1 END) as completed_calls,
    COUNT(CASE WHEN state = 'missed' THEN 1 END) as missed_calls,
    COUNT(CASE WHEN state = 'voicemail' THEN 1 END) as voicemail_calls,
    COUNT(CASE WHEN direction = 'inbound' THEN 1 END) as inbound_calls,
    COUNT(CASE WHEN direction = 'outbound' THEN 1 END) as outbound_calls,
    AVG(duration) as avg_duration,
    MAX(duration) as max_duration,
    MIN(CASE WHEN duration > 0 THEN duration END) as min_duration,
    SUM(duration) as total_duration,
    COUNT(CASE WHEN recording_id IS NOT NULL THEN 1 END) as calls_with_recording_id,
    COUNT(CASE WHEN transcription_text IS NOT NULL THEN 1 END) as calls_with_transcription
FROM call_logs;