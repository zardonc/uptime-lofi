-- Seed Data: seed.sql
-- Description: Example insertion to verify monitor schema constraints and typing.

INSERT INTO monitors (id, name, type, target, interval_sec, timeout_sec, config_json, salt)
VALUES (
    'test-monitor-1234',
    'Local Agent Monitor',
    'agent',
    'Agent probe',
    60,
    10,
    '{"platform": "linux/amd64"}',
    'local-dev-salt'
);

INSERT INTO agent_metrics (monitor_id, timestamp, cpu_percent, mem_percent, payload_json)
VALUES (
    'test-monitor-1234',
    strftime('%s', 'now'),
    15.5,
    40.2,
    '{}'
);

INSERT INTO monitor_latest (monitor_id, status, checked_at, latency_ms, uptime_ratio, cpu_percent, mem_percent, updated_at)
VALUES (
    'test-monitor-1234',
    'online',
    strftime('%s', 'now'),
    45,
    100.0,
    15.5,
    40.2,
    strftime('%s', 'now')
);
