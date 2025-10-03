-- This migration creates call_logs as an alias/copy of calls table structure
-- to support both naming conventions

-- First, let's create call_logs table that mirrors calls table
CREATE TABLE IF NOT EXISTS call_logs (
    call_id VARCHAR(255) PRIMARY KEY,
    sync_id UUID REFERENCES sync_logs(sync_id),
    contact_id VARCHAR(255) REFERENCES contacts(id),
    target_id VARCHAR(255) REFERENCES users(id),
    date_started BIGINT,
    date_rang BIGINT,
    date_connected BIGINT,
    date_ended BIGINT,
    date_from_ny VARCHAR(50),
    date_to_ny VARCHAR(50),
    direction VARCHAR(50),
    duration FLOAT,
    total_duration FLOAT,
    state VARCHAR(50),
    external_number VARCHAR(50),
    internal_number VARCHAR(50),
    contact_name VARCHAR(255),
    contact_phone VARCHAR(50),
    target VARCHAR(255),
    target_name VARCHAR(255),
    target_email VARCHAR(255),
    is_transferred BOOLEAN DEFAULT FALSE,
    was_recorded BOOLEAN DEFAULT FALSE,
    recording_id VARCHAR(255),
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

-- Copy existing data from calls to call_logs if it exists
INSERT INTO call_logs (
    call_id, sync_id, contact_id, target_id,
    date_started, date_rang, date_connected, date_ended,
    direction, duration, total_duration, state,
    external_number, internal_number,
    is_transferred, was_recorded, recording_id,
    mos_score, group_id, entry_point_call_id, master_call_id,
    event_timestamp, transcription_text, voicemail_link,
    voicemail_recording_id, created_at, updated_at
)
SELECT 
    call_id, sync_id, contact_id, target_id,
    date_started, date_rang, date_connected, date_ended,
    direction, duration, total_duration, state,
    external_number, internal_number,
    is_transferred, was_recorded, recording_id,
    mos_score, group_id, entry_point_call_id, master_call_id,
    event_timestamp, transcription_text, voicemail_link,
    voicemail_recording_id, created_at, updated_at
FROM calls
ON CONFLICT (call_id) DO NOTHING;

-- Update call_logs with contact and user information
UPDATE call_logs cl
SET 
    contact_name = ct.name,
    contact_phone = ct.phone,
    target = u.id,
    target_name = u.name,
    target_email = u.email
FROM contacts ct, users u
WHERE cl.contact_id = ct.id 
  AND cl.target_id = u.id;

-- Add date_from_ny and date_to_ny from sync_logs
UPDATE call_logs cl
SET 
    date_from_ny = sl.date_from_ny,
    date_to_ny = sl.date_to_ny
FROM sync_logs sl
WHERE cl.sync_id = sl.sync_id;

-- Create indexes for call_logs
CREATE INDEX IF NOT EXISTS idx_call_logs_date_started ON call_logs(date_started DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_sync_id ON call_logs(sync_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_direction ON call_logs(direction);
CREATE INDEX IF NOT EXISTS idx_call_logs_state ON call_logs(state);
CREATE INDEX IF NOT EXISTS idx_call_logs_target_email ON call_logs(target_email);
CREATE INDEX IF NOT EXISTS idx_call_logs_recording_id ON call_logs(recording_id) WHERE recording_id IS NOT NULL;

-- Create a trigger to keep call_logs in sync with calls
CREATE OR REPLACE FUNCTION sync_calls_to_call_logs()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO call_logs SELECT NEW.*
        ON CONFLICT (call_id) DO UPDATE SET
            sync_id = EXCLUDED.sync_id,
            date_started = EXCLUDED.date_started,
            date_rang = EXCLUDED.date_rang,
            date_connected = EXCLUDED.date_connected,
            date_ended = EXCLUDED.date_ended,
            direction = EXCLUDED.direction,
            duration = EXCLUDED.duration,
            state = EXCLUDED.state,
            external_number = EXCLUDED.external_number,
            internal_number = EXCLUDED.internal_number,
            was_recorded = EXCLUDED.was_recorded,
            recording_id = EXCLUDED.recording_id,
            transcription_text = EXCLUDED.transcription_text,
            voicemail_link = EXCLUDED.voicemail_link,
            updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE call_logs SET
            sync_id = NEW.sync_id,
            date_started = NEW.date_started,
            date_rang = NEW.date_rang,
            date_connected = NEW.date_connected,
            date_ended = NEW.date_ended,
            direction = NEW.direction,
            duration = NEW.duration,
            state = NEW.state,
            external_number = NEW.external_number,
            internal_number = NEW.internal_number,
            was_recorded = NEW.was_recorded,
            recording_id = NEW.recording_id,
            transcription_text = NEW.transcription_text,
            voicemail_link = NEW.voicemail_link,
            updated_at = CURRENT_TIMESTAMP
        WHERE call_id = NEW.call_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        DELETE FROM call_logs WHERE call_id = OLD.call_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS sync_calls_trigger ON calls;
CREATE TRIGGER sync_calls_trigger
AFTER INSERT OR UPDATE OR DELETE ON calls
FOR EACH ROW
EXECUTE FUNCTION sync_calls_to_call_logs();

-- Verify the setup
SELECT 
    'Tables synchronized' as status,
    (SELECT COUNT(*) FROM calls) as calls_count,
    (SELECT COUNT(*) FROM call_logs) as call_logs_count;