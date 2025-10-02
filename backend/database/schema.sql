-- Dialpad Logs Database Schema
-- PostgreSQL Database Setup

-- Create database (run this separately if needed)
-- CREATE DATABASE dialpad_logs;

-- Connect to the database
-- \c dialpad_logs;

-- Drop existing tables if they exist (be careful with this in production)
DROP VIEW IF EXISTS calls_view CASCADE;
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

-- Create calls table
CREATE TABLE calls (
    call_id VARCHAR(255) PRIMARY KEY,
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
    call_id VARCHAR(255) REFERENCES calls(call_id),
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
CREATE INDEX idx_recording_call_id ON recording_details(call_id);

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
LEFT JOIN users u ON c.target_id = u.id;

-- Grant permissions (adjust as needed)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_db_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_db_user;

-- Add comments for documentation
COMMENT ON TABLE calls IS 'Main table storing all call records from Dialpad';
COMMENT ON TABLE contacts IS 'Stores contact information for call participants';
COMMENT ON TABLE users IS 'Stores internal user information';
COMMENT ON TABLE recording_details IS 'Stores recording details associated with calls';
COMMENT ON VIEW calls_view IS 'Comprehensive view of calls with joined contact and user information';
