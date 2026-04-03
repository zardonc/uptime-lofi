-- Migration: 0003_login_attempts.sql
-- Description: Create login_attempts table for cross-instance rate limiting

-- Login failure tracking (cross-instance)
CREATE TABLE IF NOT EXISTS login_attempts (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	ip_address TEXT NOT NULL,
	attempt_count INTEGER DEFAULT 1,
	first_attempt_at INTEGER NOT NULL,
	last_attempt_at INTEGER NOT NULL,
	UNIQUE(ip_address)
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_login_attempts_time ON login_attempts(last_attempt_at);
