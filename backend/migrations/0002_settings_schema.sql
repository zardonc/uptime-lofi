-- Migration: 0002_settings_schema.sql
-- Description: Create Key-Value settings table for Dashboard UI_ACCESS_KEY and other dynamic config

CREATE TABLE IF NOT EXISTS kv_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Initialize default state: UI lock is completely disabled
INSERT INTO kv_settings (key, value) VALUES ('ui_lock_enabled', 'false');
