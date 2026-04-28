-- Migration: 0005_query_indexes.sql
-- Description: Add targeted indexes for hot query paths identified during Phase 6 performance audit.
--
-- Analysis of existing indexes:
-- - idx_raw_metrics_node_time (node_id, timestamp) — already covers time-range queries ✓
-- - idx_audit_log_time (created_at) — already covers cleanup queries ✓
-- - idx_login_attempts_ip_hash (ip_hash) — already covers rate limit lookups ✓
-- - idx_refresh_tokens_hash/token_session — covers auth lookups but NOT cleanup ✓
--
-- Missing indexes addressed by this migration:
-- 1. daily_stats(node_id, date) — dashboard lookups: WHERE node_id = ? ORDER BY date DESC
-- 2. refresh_tokens(expires_at) — cron cleanup: WHERE expires_at < ?

-- 1. Composite index for dashboard daily_stats lookups
-- Supports: SELECT ... FROM daily_stats WHERE node_id = ? ORDER BY date DESC/ASC
CREATE INDEX IF NOT EXISTS idx_daily_stats_node_date ON daily_stats(node_id, date);

-- 2. Index for periodic cleanup of expired refresh tokens
-- Supports: DELETE FROM refresh_tokens WHERE expires_at < strftime('%s', 'now')
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
