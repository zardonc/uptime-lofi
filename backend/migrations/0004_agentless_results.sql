-- Migration: 0004_agentless_results.sql
-- Description: Store Agentless check error text and speed up scheduled due-check scans.

ALTER TABLE raw_metrics ADD COLUMN error_text TEXT;

CREATE INDEX IF NOT EXISTS idx_nodes_agentless_due ON nodes (type, status, last_heartbeat);
