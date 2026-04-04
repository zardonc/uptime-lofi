-- Migration: 0004_audit_log_and_ip_hash.sql
-- Description: Create audit_log table for security audit trail and add ip_hash column to login_attempts

-- 1. Create audit_log table for permanent audit trail
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,        -- 'emergency_unlock', 'login_success', 'login_failure', 'session_revoked'
  ip_hash TEXT NOT NULL,       -- HMAC-SHA256 hashed IP
  details TEXT,                -- JSON with additional context (e.g., session_id)
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_time ON audit_log(created_at);

-- 2. Add ip_hash column to login_attempts
-- Existing rows will have NULL ip_hash — they will expire naturally
-- New inserts will use ip_hash from the start
ALTER TABLE login_attempts ADD COLUMN ip_hash TEXT;

-- 3. Create index on ip_hash for lookups
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_hash ON login_attempts(ip_hash);
