-- Migration: 0005_query_indexes.sql
-- Description: Add targeted indexes for hot query paths identified during Phase 6 performance audit.

-- Index for periodic cleanup of expired refresh tokens.
-- Supports: DELETE FROM refresh_tokens WHERE expires_at < strftime('%s', 'now')
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
