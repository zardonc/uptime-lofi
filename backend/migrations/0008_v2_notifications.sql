-- Migration: 0008_v2_notifications.sql
-- Description: Add v2 notification channels and per-alert delivery records.

CREATE TABLE IF NOT EXISTS notification_channels (
    id TEXT PRIMARY KEY,
    backend_id TEXT NOT NULL DEFAULT 'default',
    type TEXT NOT NULL CHECK (type IN ('webhook', 'telegram', 'email')),
    name TEXT NOT NULL,
    config_json TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    last_test_status TEXT NOT NULL DEFAULT 'untested' CHECK (last_test_status IN ('untested', 'ok', 'failing', 'disabled')),
    last_test_message TEXT,
    last_tested_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    archived_at INTEGER
);

CREATE TABLE IF NOT EXISTS alert_notification_deliveries (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    channel_type TEXT NOT NULL CHECK (channel_type IN ('webhook', 'telegram', 'email', 'unknown')),
    status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped', 'not_implemented')),
    status_code INTEGER,
    error_message TEXT,
    attempted_at INTEGER NOT NULL,
    FOREIGN KEY(event_id) REFERENCES alert_events(id),
    FOREIGN KEY(channel_id) REFERENCES notification_channels(id)
);

CREATE INDEX IF NOT EXISTS idx_notification_channels_active ON notification_channels (archived_at, enabled, type, updated_at);
CREATE INDEX IF NOT EXISTS idx_alert_notification_deliveries_event ON alert_notification_deliveries (event_id, attempted_at DESC);
