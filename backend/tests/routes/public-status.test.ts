import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import app from "../../src/index";

describe("Public Status Routes (/api/public)", () => {
  let testEnv: any;

  beforeEach(async () => {
    testEnv = {
      ...env,
      API_SECRET_KEY: "test_admin_key",
      INTERNAL_API_KEY: "test_internal_key",
      SESSION_BLACKLIST: {
        store: new Map(),
        async get(key: string) { return this.store.get(key) || null; },
      },
    };

    const db = (env as any).DB;
    await db.prepare("DELETE FROM monitor_latest").run();
    await db.prepare("DELETE FROM agent_metrics").run();
    await db.prepare("DELETE FROM check_results").run();
    await db.prepare("DELETE FROM monitors").run();
    await db.prepare("DELETE FROM kv_settings").run();
  });

  it("returns a non-public response while Public Status is disabled", async () => {
    await seedMonitor({ id: "private-http", publicVisible: true });

    const res = await app.fetch(new Request("http://localhost/api/public/status"), testEnv);
    const body = await res.json() as any;

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("public_status_unavailable");
  });

  it("omits hidden monitors and redacts secret-like operational data", async () => {
    const db = (env as any).DB;
    await db.prepare("INSERT INTO kv_settings (key, value) VALUES ('public_status_config', ?)")
      .bind(JSON.stringify({
        enabled: true,
        private_slug: null,
        show_uptime: true,
        show_latency: true,
        show_incidents: true,
        show_monitor_type: true,
      }))
      .run();
    await seedMonitor({
      id: "public-http",
      publicVisible: true,
      config: {
        url: "https://status.example.com/internal?api_key=secret",
        bot_token: "telegram-secret",
        monitor_secret: "probe-secret",
        containers: [{ image: "internal/backend:latest" }],
        backend_url: "https://worker-internal.example.com",
      },
    });
    await seedMonitor({ id: "hidden-http", publicVisible: false });
    await db.prepare(
      `INSERT INTO monitor_latest (monitor_id, status, checked_at, latency_ms, uptime_ratio, error_text, updated_at)
       VALUES ('public-http', 'online', 1000, 42, 99.95, NULL, 1000)`,
    ).run();

    const res = await app.fetch(new Request("http://localhost/api/public/status"), testEnv);
    const body = await res.json() as any;
    const serialized = JSON.stringify(body);

    expect(res.status).toBe(200);
    expect(body.monitors).toHaveLength(1);
    expect(body.monitors[0]).toMatchObject({
      id: "public-http",
      name: "public-http",
      status: "online",
      latency_ms: 42,
      uptime_ratio: 99.95,
    });
    expect(serialized).not.toContain("hidden-http");
    expect(serialized).not.toContain("api_key");
    expect(serialized).not.toContain("bot_token");
    expect(serialized).not.toContain("monitor_secret");
    expect(serialized).not.toContain("containers");
    expect(serialized).not.toContain("worker-internal.example.com");
  });

  it("honors private slug and field visibility controls", async () => {
    const db = (env as any).DB;
    await db.prepare("INSERT INTO kv_settings (key, value) VALUES ('public_status_config', ?)")
      .bind(JSON.stringify({
        enabled: true,
        private_slug: "team-only",
        show_uptime: false,
        show_latency: false,
        show_incidents: false,
        show_monitor_type: false,
      }))
      .run();
    await seedMonitor({ id: "slugged-http", publicVisible: true });
    await db.prepare(
      `INSERT INTO monitor_latest (monitor_id, status, checked_at, latency_ms, uptime_ratio, error_text, updated_at)
       VALUES ('slugged-http', 'online', 1000, 42, 99.95, NULL, 1000)`,
    ).run();

    const missing = await app.fetch(new Request("http://localhost/api/public/status"), testEnv);
    const ok = await app.fetch(new Request("http://localhost/api/public/status?slug=team-only"), testEnv);
    const body = await ok.json() as any;

    expect(missing.status).toBe(404);
    expect(ok.status).toBe(200);
    expect(body.monitors[0]).not.toHaveProperty("type");
    expect(body.monitors[0]).not.toHaveProperty("latency_ms");
    expect(body.monitors[0]).not.toHaveProperty("uptime_ratio");
    expect(body.incidents).toEqual([]);
  });

  it("does not accept write methods on public routes", async () => {
    const res = await app.fetch(new Request("http://localhost/api/public/status", { method: "POST" }), testEnv);

    expect(res.status).not.toBe(200);
  });
});

async function seedMonitor({
  id,
  publicVisible,
  config = { url: "https://example.com/health", expected_status: 200 },
}: {
  readonly id: string;
  readonly publicVisible: boolean;
  readonly config?: Record<string, unknown>;
}) {
  await (env as any).DB.prepare(
    `INSERT INTO monitors (
       id, backend_id, name, type, target, interval_sec, timeout_sec,
       expected_json, config_json, paused, public_visible, created_at, updated_at
     ) VALUES (?, 'default', ?, 'http', ?, 60, 10, '{}', ?, 0, ?, 1, 1)`,
  ).bind(id, id, String(config.url ?? "https://example.com/health"), JSON.stringify(config), publicVisible ? 1 : 0).run();
}
