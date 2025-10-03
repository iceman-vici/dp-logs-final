-- Migration to fix timestamp columns to use BIGINT instead of INTEGER
-- Run this to update your existing database

-- First, alter the sync_logs table to use BIGINT for timestamps
ALTER TABLE sync_logs 
  ALTER COLUMN duration_seconds TYPE BIGINT;

-- If you have existing data with sync logs, this is safe to run
-- If not, you can skip this migration and just recreate the schema

-- Alternative: Drop and recreate tables (ONLY if you don't have important data)
-- Uncomment below if you want to start fresh:

/*
DROP VIEW IF EXISTS sync_summary_view CASCADE;
DROP VIEW IF EXISTS failed_sync_details_view CASCADE;
DROP VIEW IF EXISTS calls_view CASCADE;
DROP TABLE IF EXISTS sync_log_details CASCADE;
DROP TABLE IF EXISTS sync_logs CASCADE;
DROP TABLE IF EXISTS recording_details CASCADE;
DROP TABLE IF EXISTS calls CASCADE;
DROP TABLE IF EXISTS contacts CASCADE;
DROP TABLE IF EXISTS users CASCADE;
*/

-- Then run the main schema.sql file to recreate everything