-- Migration: 0003_nodes_lifecycle.sql
-- Description: Add lifecycle archive metadata for node management without deleting metrics history.

ALTER TABLE nodes ADD COLUMN archived_at INTEGER;
ALTER TABLE nodes ADD COLUMN updated_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_nodes_active_status_heartbeat
ON nodes (archived_at, status, last_heartbeat);
