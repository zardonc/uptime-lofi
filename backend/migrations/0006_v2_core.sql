-- Migration: 0006_v2_core.sql
-- Description: Add v2 monitor domain tables and latest read model.

CREATE TABLE IF NOT EXISTS monitors (
    id TEXT PRIMARY KEY,
    backend_id TEXT NOT NULL DEFAULT 'default',
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('agent', 'http', 'tcp')),
    target TEXT,
    interval_sec INTEGER NOT NULL DEFAULT 60,
    timeout_sec INTEGER NOT NULL DEFAULT 10,
    expected_json TEXT,
    config_json TEXT NOT NULL,
    paused INTEGER NOT NULL DEFAULT 0,
    public_visible INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    archived_at INTEGER
);

CREATE TABLE IF NOT EXISTS check_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    monitor_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('up', 'down', 'warn')),
    latency_ms INTEGER,
    detail_json TEXT,
    FOREIGN KEY(monitor_id) REFERENCES monitors(id)
);

CREATE TABLE IF NOT EXISTS agent_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    monitor_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    cpu_percent REAL,
    mem_percent REAL,
    payload_json TEXT,
    FOREIGN KEY(monitor_id) REFERENCES monitors(id)
);

CREATE TABLE IF NOT EXISTS monitor_latest (
    monitor_id TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('online', 'degraded', 'offline', 'unknown')),
    checked_at INTEGER,
    latency_ms INTEGER,
    uptime_ratio REAL,
    cpu_percent REAL,
    mem_percent REAL,
    error_text TEXT,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY(monitor_id) REFERENCES monitors(id)
);

CREATE INDEX IF NOT EXISTS idx_monitors_active_type ON monitors (archived_at, type, paused, updated_at);
CREATE INDEX IF NOT EXISTS idx_monitors_active_name ON monitors (archived_at, lower(name));
CREATE INDEX IF NOT EXISTS idx_check_results_monitor_time ON check_results (monitor_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_agent_metrics_monitor_time ON agent_metrics (monitor_id, timestamp DESC);
