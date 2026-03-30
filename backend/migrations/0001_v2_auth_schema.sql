-- Migration: 0001_v2_auth_schema.sql
-- Description: Implement schema changes for V2 Decoupled Auth (refresh_tokens and salt)

-- 1. Add salt column to nodes for dynamic PSK derivation
ALTER TABLE nodes ADD COLUMN salt TEXT;

-- 2. Create refresh_tokens table for frontend Stateful RTR
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL UNIQUE,
    session_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'rotated', 'revoked'
    replaced_by INTEGER, -- Points to the id of the new token in the rotation chain
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- 3. Fast lookups for hash verification and session revocation
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_session ON refresh_tokens (session_id);
