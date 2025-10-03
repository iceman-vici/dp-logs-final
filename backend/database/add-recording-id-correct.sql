-- Add recording_id column to calls table (not call_logs)
ALTER TABLE calls 
ADD COLUMN IF NOT EXISTS recording_id VARCHAR(255);

-- Add index for recording_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_calls_recording_id 
ON calls(recording_id) 
WHERE recording_id IS NOT NULL;

-- Drop existing view to recreate it
DROP VIEW IF EXISTS calls_view CASCADE;

-- Recreate the enhanced calls_view with recording information
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
    END AS connected_at,
    -- Add recording status
    CASE 
        WHEN c.recording_id IS NOT NULL THEN true
        ELSE c.was_recorded
    END as has_recording,
    -- Format timestamps to NY timezone for display
    TO_CHAR(to_timestamp(c.date_started / 1000) AT TIME ZONE 'America/New_York', 'MM/DD/YYYY HH24:MI:SS') as date_started_ny_formatted,
    TO_CHAR(to_timestamp(c.date_rang / 1000) AT TIME ZONE 'America/New_York', 'MM/DD/YYYY HH24:MI:SS') as date_rang_ny_formatted,
    TO_CHAR(to_timestamp(c.date_connected / 1000) AT TIME ZONE 'America/New_York', 'MM/DD/YYYY HH24:MI:SS') as date_connected_ny_formatted,
    TO_CHAR(to_timestamp(c.date_ended / 1000) AT TIME ZONE 'America/New_York', 'MM/DD/YYYY HH24:MI:SS') as date_ended_ny_formatted
FROM calls c
LEFT JOIN contacts ct ON c.contact_id = ct.id
LEFT JOIN users u ON c.target_id = u.id
LEFT JOIN sync_logs sl ON c.sync_id = sl.sync_id;

-- Create a view for calls with recordings
CREATE OR REPLACE VIEW calls_with_recordings AS
SELECT 
    c.call_id,
    c.external_number,
    ct.name as contact_name,
    u.name as target_name,
    c.recording_id,
    c.was_recorded,
    c.voicemail_link,
    c.transcription_text,
    to_timestamp(c.date_started / 1000) as date_started,
    to_timestamp(c.date_ended / 1000) as date_ended,
    c.duration,
    c.state,
    c.direction
FROM calls c
LEFT JOIN contacts ct ON c.contact_id = ct.id
LEFT JOIN users u ON c.target_id = u.id
WHERE c.recording_id IS NOT NULL 
   OR c.was_recorded = true 
   OR c.voicemail_link IS NOT NULL
ORDER BY c.date_started DESC;

-- Add comment for documentation
COMMENT ON COLUMN calls.recording_id IS 'Unique identifier for the call recording from Dialpad API';

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

-- Create or update statistics view to include recording stats
CREATE OR REPLACE VIEW call_statistics AS
SELECT
    COUNT(*) as total_calls,
    COUNT(DISTINCT target_id) as unique_users,
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
    COUNT(CASE WHEN transcription_text IS NOT NULL THEN 1 END) as calls_with_transcription,
    COUNT(CASE WHEN voicemail_link IS NOT NULL THEN 1 END) as calls_with_voicemail,
    ROUND(
        100.0 * COUNT(CASE WHEN was_recorded = true OR recording_id IS NOT NULL THEN 1 END) / NULLIF(COUNT(*), 0),
        2
    ) as recording_percentage
FROM calls;

-- Update the sync summary view to include recording stats
CREATE OR REPLACE VIEW sync_summary_view AS
SELECT 
    sl.*,
    COUNT(DISTINCT sld.call_id) AS unique_call_attempts,
    COUNT(CASE WHEN sld.status = 'success' THEN 1 END) AS success_details,
    COUNT(CASE WHEN sld.status = 'failed' THEN 1 END) AS failed_details,
    COUNT(CASE WHEN sld.status = 'retry_pending' THEN 1 END) AS pending_retries,
    -- Add recording stats for this sync
    (
        SELECT COUNT(*) 
        FROM calls c 
        WHERE c.sync_id = sl.sync_id 
          AND (c.recording_id IS NOT NULL OR c.was_recorded = true)
    ) AS calls_with_recordings
FROM sync_logs sl
LEFT JOIN sync_log_details sld ON sl.sync_id = sld.sync_id
GROUP BY sl.id, sl.sync_id, sl.date_from, sl.date_to, sl.date_from_ny, sl.date_to_ny, 
         sl.sync_mode, sl.status, sl.total_calls, sl.total_pages, sl.inserted_count, 
         sl.failed_count, sl.duration_seconds, sl.error_message, sl.started_at, 
         sl.completed_at, sl.created_by, sl.created_at;

-- Create index on calls for faster recording queries
CREATE INDEX IF NOT EXISTS idx_calls_has_recording 
ON calls((recording_id IS NOT NULL OR was_recorded = true));

-- Verify the migration
SELECT 
    'Migration completed successfully' as status,
    COUNT(*) as total_calls,
    COUNT(recording_id) as calls_with_recording_id
FROM calls;