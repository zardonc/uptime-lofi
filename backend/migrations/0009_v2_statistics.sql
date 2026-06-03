-- Migration: 0009_v2_statistics.sql
-- Description: Add v2 statistics daily rollups derived from check_results.

CREATE TABLE IF NOT EXISTS daily_summaries (
    monitor_id TEXT NOT NULL,
    date TEXT NOT NULL,
    check_count INTEGER NOT NULL DEFAULT 0,
    up_count INTEGER NOT NULL DEFAULT 0,
    warn_count INTEGER NOT NULL DEFAULT 0,
    down_count INTEGER NOT NULL DEFAULT 0,
    avg_latency_ms REAL,
    p95_latency_ms REAL,
    downtime_sec INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    PRIMARY KEY (monitor_id, date),
    FOREIGN KEY(monitor_id) REFERENCES monitors(id)
);

CREATE INDEX IF NOT EXISTS idx_daily_summaries_date ON daily_summaries (date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_summaries_monitor_date ON daily_summaries (monitor_id, date DESC);
