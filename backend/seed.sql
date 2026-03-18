-- Seed Data: seed.sql
-- Description: Example insertion to verify table constraints and schema typing

INSERT INTO nodes (id, name, type, status, last_heartbeat, config_json)
VALUES (
    'test-node-1234',
    'Local Agent Node',
    'agent_push',
    'online',
    strftime('%s', 'now'),
    '{"psk": "local-dev-psk-123"}'
);

INSERT INTO raw_metrics (node_id, timestamp, ping_ms, cpu_usage, mem_usage, is_up)
VALUES (
    'test-node-1234',
    strftime('%s', 'now'),
    45,
    15.5,
    40.2,
    1
);

INSERT INTO daily_stats (node_id, date, uptime_ratio, avg_ping_ms, down_events)
VALUES (
    'test-node-1234',
    date('now'),
    100.0,
    45,
    0
);
