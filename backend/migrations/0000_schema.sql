-- Migration: 0000_schema.sql
-- Description: Initial schema for Cloud-Uptime D1 database featuring nodes, raw_metrics, and daily_stats.

-- Table 1: nodes (受控节点表)
CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'agent_push', 'agentless_http', 'agentless_tcp'
    status TEXT NOT NULL DEFAULT 'offline', -- 'online', 'offline', 'paused'
    last_heartbeat INTEGER,
    config_json TEXT, -- JSON structure for specific configs like PSK or URL
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Table 2: raw_metrics (原始高频切片表)
CREATE TABLE IF NOT EXISTS raw_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    ping_ms INTEGER,
    cpu_usage REAL,
    mem_usage REAL,
    is_up BOOLEAN NOT NULL,
    containers_json TEXT, -- Optional JSON string recording Docker container states 
    FOREIGN KEY(node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Table 3: daily_stats (按日聚类归档表)
CREATE TABLE IF NOT EXISTS daily_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL,
    date TEXT NOT NULL, -- Format: YYYY-MM-DD
    uptime_ratio REAL NOT NULL,
    avg_ping_ms INTEGER NOT NULL,
    down_events INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Indexing Strategy
CREATE INDEX IF NOT EXISTS idx_nodes_status_heartbeat ON nodes (status, last_heartbeat);
CREATE INDEX IF NOT EXISTS idx_raw_metrics_node_time ON raw_metrics (node_id, timestamp);
