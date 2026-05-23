import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import app from "../../src/index";

type MemoryKv = KVNamespace & { readonly store: Map<string, string> };

describe("Internal Statistics Routes (/api/internal/v1/statistics)", () => {
  let testEnv: any;
  let cache: MemoryKv;

  beforeEach(async () => {
    cache = createMemoryKv();
    testEnv = {
      ...env,
      API_SECRET_KEY: "test_admin_key",
      INTERNAL_API_KEY: "test_internal_key",
      STATISTICS_CACHE: cache,
      SESSION_BLACKLIST: {
        store: new Map(),
        async get(key: string) { return this.store.get(key) || null; },
      },
    };

    const db = (env as any).DB;
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

  const request = (path: string, init: RequestInit = {}) => app.fetch(
    new Request(`http://localhost${path}`, {
      ...init,
      headers: {
        "x-uptime-lofi-internal-key": "test_internal_key",
        "Content-Type": "application/json",
        ...init.headers,
      },
    }),
    testEnv,
  );

  it("requires the Pages Functions internal key", async () => {
    const res = await app.fetch(new Request("http://localhost/api/internal/v1/statistics/summary"), testEnv);

    expect(res.status).toBe(401);
  });

  it("uses fresh KV snapshots when present", async () => {
    await cache.put("statistics:v1:summary:7d", JSON.stringify({
      version: 1,
      generated_at: 1_800_000_000,
      range: "7d",
      data: {
        backend_id: "default",
        backend_label: "Default backend",
        backend_type: "cloudflare_worker",
        range: "7d",
        generated_at: 1_800_000_000,
        total_monitors: 9,
        online_monitors: 8,
        incident_count: 2,
        total_downtime_sec: 60,
        avg_latency_ms: 44,
        uptime_ratio: 99.9,
      },
    }));

    const res = await request("/api/internal/v1/statistics/summary?range=7d");
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.meta.cache).toBe("hit");
    expect(body.data.total_monitors).toBe(9);
    expect(body.data.backend_id).toBe("default");
  });

  it("falls back to D1 and repopulates KV when cache is absent", async () => {
    const now = Math.floor(Date.now() / 1000);
    await seedMonitor((env as any).DB, now);

    const res = await request("/api/internal/v1/statistics/leaderboards?range=7d");
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.meta.cache).toBe("miss");
    expect(body.data.downtime[0]).toMatchObject({
      monitor_id: "http-1",
      monitor_name: "Homepage",
      label: "1m",
    });
    expect(await cache.get("statistics:v1:leaderboards:7d")).toBeTruthy();
  });

  it("returns no-data states honestly", async () => {
    const summary = await request("/api/internal/v1/statistics/summary?range=7d");
    const leaderboards = await request("/api/internal/v1/statistics/leaderboards?range=7d");
    const trends = await request("/api/internal/v1/statistics/trends?range=7d");

    expect(((await summary.json()) as any).data).toMatchObject({
      total_monitors: 0,
      online_monitors: 0,
      uptime_ratio: null,
      avg_latency_ms: null,
    });
    expect(((await leaderboards.json()) as any).data.downtime).toEqual([]);
    expect(((await trends.json()) as any).data.availability).toEqual([]);
  });
});

async function seedMonitor(db: D1Database, now: number) {
  await db.prepare(
    `INSERT INTO monitors (
       id, backend_id, name, type, target, interval_sec, timeout_sec,
       expected_json, config_json, paused, public_visible, created_at, updated_at
     ) VALUES ('http-1', 'default', 'Homepage', 'http', 'https://example.com', 60, 10, '{}', '{"url":"https://example.com"}', 0, 1, ?, ?)`,
  ).bind(now - 600, now - 600).run();
  await db.prepare(
    "INSERT INTO check_results (monitor_id, timestamp, status, latency_ms, detail_json) VALUES ('http-1', ?, 'down', NULL, '{}')",
  ).bind(now - 60).run();
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
