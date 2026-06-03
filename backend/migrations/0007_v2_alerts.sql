-- Migration: 0007_v2_alerts.sql
-- Description: Add v2 alert rules, evaluation state, and history tables.

CREATE TABLE IF NOT EXISTS alert_rules (
    id TEXT PRIMARY KEY,
    backend_id TEXT NOT NULL DEFAULT 'default',
    name TEXT NOT NULL,
    monitor_id TEXT NOT NULL,
    condition TEXT NOT NULL CHECK (condition IN ('offline', 'latency', 'http_status', 'cpu', 'memory')),
    params_json TEXT NOT NULL,
    channel_ids_json TEXT NOT NULL DEFAULT '[]',
    enabled INTEGER NOT NULL DEFAULT 1,
    severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
    confirm_for_sec INTEGER NOT NULL DEFAULT 0,
    repeat_interval_sec INTEGER NOT NULL DEFAULT 3600,
    silent_hours_json TEXT,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    archived_at INTEGER,
    FOREIGN KEY(monitor_id) REFERENCES monitors(id)
);

CREATE TABLE IF NOT EXISTS alert_rule_state (
    rule_id TEXT PRIMARY KEY,
    monitor_id TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('ok', 'pending', 'firing', 'suppressed', 'recovered')),
    incident_key TEXT,
    first_seen_at INTEGER,
    last_seen_at INTEGER,
    last_notified_at INTEGER,
    recovered_at INTEGER,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY(rule_id) REFERENCES alert_rules(id),
    FOREIGN KEY(monitor_id) REFERENCES monitors(id)
);

CREATE TABLE IF NOT EXISTS alert_events (
    id TEXT PRIMARY KEY,
    rule_id TEXT NOT NULL,
    monitor_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('pending', 'firing', 'suppressed', 'recovered')),
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    message TEXT NOT NULL,
    dedupe_key TEXT NOT NULL,
    notification_status TEXT NOT NULL DEFAULT 'pending' CHECK (notification_status IN ('pending', 'suppressed', 'not_required')),
    created_at INTEGER NOT NULL,
    detail_json TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY(rule_id) REFERENCES alert_rules(id),
    FOREIGN KEY(monitor_id) REFERENCES monitors(id)
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_active_monitor ON alert_rules (archived_at, enabled, monitor_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_alert_events_created ON alert_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_events_monitor ON alert_events (monitor_id, created_at DESC);
