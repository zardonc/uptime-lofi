import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import {
  getStatisticsLeaderboards,
  getStatisticsSummary,
  refreshStatistics,
} from "../../src/services/statisticsRollup";

type MemoryKv = KVNamespace & { readonly store: Map<string, string> };

describe("statisticsRollup", () => {
  let cache: MemoryKv;

  beforeEach(async () => {
    cache = createMemoryKv();
    const db = (env as any).DB as D1Database;
    await db.prepare("DELETE FROM daily_summaries").run();
    await db.prepare("DELETE FROM alert_notification_deliveries").run();
    await db.prepare("DELETE FROM notification_channels").run();
    await db.prepare("DELETE FROM alert_events").run();
    await db.prepare("DELETE FROM alert_rule_state").run();
    await db.prepare("DELETE FROM alert_rules").run();
    await db.prepare("DELETE FROM monitor_latest").run();
    await db.prepare("DELETE FROM agent_metrics").run();
    await db.prepare("DELETE FROM check_results").run();
    await db.prepare("DELETE FROM monitors").run();
  });

  it("builds rollups from D1 fixture data and stores daily_summaries", async () => {
    const db = (env as any).DB as D1Database;
    const now = 1_800_000_000;
    await seedStatisticsData(db, now);

    await refreshStatistics({ DB: db, STATISTICS_CACHE: cache }, now);

    const summary = await getStatisticsSummary({ DB: db, STATISTICS_CACHE: cache }, "7d", now);
    expect(summary.data).toMatchObject({
      total_monitors: 3,
      online_monitors: 1,
      incident_count: 1,
      total_downtime_sec: 60,
      uptime_ratio: 66.67,
      backend_id: "default",
    });
    expect(summary.data.avg_latency_ms).toBeGreaterThan(0);
    expect(await db.prepare("SELECT COUNT(*) FROM daily_summaries").first("COUNT(*)")).toBeGreaterThan(0);
  });

  it("writes KV snapshots with version and generated timestamp metadata", async () => {
    const db = (env as any).DB as D1Database;
    const now = 1_800_000_000;
    await seedStatisticsData(db, now);

    await refreshStatistics({ DB: db, STATISTICS_CACHE: cache }, now);

    const raw = await cache.get("statistics:v1:leaderboards:7d");
    expect(raw).toBeTruthy();
    const envelope = JSON.parse(raw ?? "{}") as {
      version?: number;
      generated_at?: number;
      range?: string;
      data?: { downtime?: unknown[]; resource_heavy?: unknown[] };
    };
    expect(envelope.version).toBe(1);
    expect(typeof envelope.generated_at).toBe("number");
    expect(envelope.range).toBe("7d");
    expect(envelope.data?.downtime).toHaveLength(1);
    expect(envelope.data?.resource_heavy).toHaveLength(1);
  });

  it("recovers missing KV cache by rerunning the D1 rollup path", async () => {
    const db = (env as any).DB as D1Database;
    const now = 1_800_000_000;
    await seedStatisticsData(db, now);

    await refreshStatistics({ DB: db, STATISTICS_CACHE: cache }, now);
    await cache.delete("statistics:v1:summary:7d");

    const recovered = await getStatisticsSummary({ DB: db, STATISTICS_CACHE: cache }, "7d", now);

    expect(recovered.cache).toBe("miss");
    expect(recovered.data.total_monitors).toBe(3);
    expect(await cache.get("statistics:v1:summary:7d")).toBeTruthy();
  });

  it("returns empty leaderboards honestly when no source rows exist", async () => {
    const db = (env as any).DB as D1Database;
    const leaderboards = await getStatisticsLeaderboards({ DB: db, STATISTICS_CACHE: cache }, "7d", 1_800_000_000);

    expect(leaderboards.data.downtime).toEqual([]);
    expect(leaderboards.data.slowest).toEqual([]);
    expect(leaderboards.data.resource_heavy).toEqual([]);
  });
});

async function seedStatisticsData(db: D1Database, now: number) {
  await db.prepare(
    `INSERT INTO monitors (
       id, backend_id, name, type, target, interval_sec, timeout_sec,
       expected_json, config_json, paused, public_visible, created_at, updated_at
     ) VALUES
       ('agent-1', 'default', 'Agent One', 'agent', NULL, 60, 10, '{}', '{}', 0, 1, ?, ?),
       ('http-1', 'default', 'Homepage', 'http', 'https://example.com', 60, 10, '{}', '{"url":"https://example.com"}', 0, 1, ?, ?),
       ('tcp-1', 'default', 'Postgres', 'tcp', 'db.example.com:5432', 60, 10, '{}', '{"host":"db.example.com","port":5432}', 0, 1, ?, ?)`,
  ).bind(now - 600, now - 600, now - 600, now - 600, now - 600, now - 600).run();

  await db.prepare(
    `INSERT INTO monitor_latest (
       monitor_id, status, checked_at, latency_ms, uptime_ratio, cpu_percent, mem_percent, error_text, updated_at
     ) VALUES
       ('agent-1', 'online', ?, 12, 100, 78, 41, NULL, ?),
       ('http-1', 'offline', ?, NULL, 33, NULL, NULL, 'timeout', ?),
       ('tcp-1', 'degraded', ?, 240, 66, NULL, NULL, NULL, ?)`,
  ).bind(now - 60, now - 60, now - 60, now - 60, now - 60, now - 60).run();

  await db.prepare(
    `INSERT INTO check_results (monitor_id, timestamp, status, latency_ms, detail_json) VALUES
       ('http-1', ?, 'up', 120, '{}'),
       ('http-1', ?, 'down', NULL, '{"error_text":"timeout"}'),
       ('tcp-1', ?, 'warn', 240, '{}')`,
  ).bind(now - 300, now - 240, now - 180).run();

  await db.prepare(
    "INSERT INTO agent_metrics (monitor_id, timestamp, cpu_percent, mem_percent, payload_json) VALUES ('agent-1', ?, 78, 41, '{}')",
  ).bind(now - 120).run();

  await db.prepare(
    `INSERT INTO alert_rules (
       id, backend_id, name, monitor_id, condition, params_json, channel_ids_json,
       enabled, severity, confirm_for_sec, repeat_interval_sec, timezone, created_at, updated_at
     ) VALUES ('rule-1', 'default', 'Homepage offline', 'http-1', 'offline', '{}', '[]', 1, 'critical', 0, 3600, 'UTC', ?, ?)`,
  ).bind(now - 500, now - 500).run();

  await db.prepare(
    `INSERT INTO alert_events (
       id, rule_id, monitor_id, event_type, severity, message, dedupe_key,
       notification_status, created_at, detail_json
     ) VALUES ('event-1', 'rule-1', 'http-1', 'firing', 'critical', 'Homepage is offline', 'dedupe', 'pending', ?, '{}')`,
  ).bind(now - 200).run();
}

function createMemoryKv(): MemoryKv {
  const store = new Map<string, string>();
  return {
    store,
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  } as unknown as MemoryKv;
}
