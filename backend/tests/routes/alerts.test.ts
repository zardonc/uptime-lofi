import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import app from "../../src/index";

describe("Internal Alert Routes (/api/internal/v1/alerts)", () => {
  let testEnv: any;
  const db = (env as any).DB;

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

    await db.prepare("DELETE FROM alert_events").run();
    await db.prepare("DELETE FROM alert_rule_state").run();
    await db.prepare("DELETE FROM alert_rules").run();
    await db.prepare("DELETE FROM monitor_latest").run();
    await db.prepare("DELETE FROM agent_metrics").run();
    await db.prepare("DELETE FROM check_results").run();
    await db.prepare("DELETE FROM monitors").run();

    await insertMonitor("agent-1", "Agent One", "agent", { platform: "linux/amd64" });
    await insertMonitor("http-1", "Homepage", "http", { url: "https://example.com", expected_status: 200 });
    await insertMonitor("tcp-1", "Postgres", "tcp", { host: "db.example.com", port: 5432 });
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

  it("creates, lists, updates, enables/disables, and deletes alert rules", async () => {
    const created = await request("/api/internal/v1/alerts/rules", {
      method: "POST",
      body: JSON.stringify({
        name: "Homepage offline",
        monitor_id: "http-1",
        condition: "offline",
        severity: "critical",
        confirm_for_sec: 60,
        repeat_interval_sec: 600,
      }),
    });
    expect(created.status).toBe(200);
    const rule = ((await created.json()) as any).data;
    expect(rule).toMatchObject({
      name: "Homepage offline",
      monitor_id: "http-1",
      condition: "offline",
      enabled: true,
      severity: "critical",
      confirm_for_sec: 60,
      repeat_interval_sec: 600,
    });

    const listed = await request("/api/internal/v1/alerts/rules");
    expect(((await listed.json()) as any).data).toHaveLength(1);

    const updated = await request(`/api/internal/v1/alerts/rules/${rule.id}`, {
      method: "PUT",
      body: JSON.stringify({ name: "Homepage latency", condition: "latency", params: { threshold_ms: 750 } }),
    });
    expect(updated.status).toBe(200);
    expect(((await updated.json()) as any).data).toMatchObject({
      name: "Homepage latency",
      condition: "latency",
      params: { threshold_ms: 750 },
    });

    const disabled = await request(`/api/internal/v1/alerts/rules/${rule.id}/disable`, { method: "POST" });
    expect(((await disabled.json()) as any).data.enabled).toBe(false);

    const enabled = await request(`/api/internal/v1/alerts/rules/${rule.id}/enable`, { method: "POST" });
    expect(((await enabled.json()) as any).data.enabled).toBe(true);

    const deleted = await request(`/api/internal/v1/alerts/rules/${rule.id}`, { method: "DELETE" });
    expect(deleted.status).toBe(200);

    const afterDelete = await request("/api/internal/v1/alerts/rules");
    expect(((await afterDelete.json()) as any).data).toHaveLength(0);
  });

  it("rejects CPU rules on HTTP monitors and HTTP status rules on TCP monitors", async () => {
    const cpuOnHttp = await request("/api/internal/v1/alerts/rules", {
      method: "POST",
      body: JSON.stringify({
        name: "Bad CPU",
        monitor_id: "http-1",
        condition: "cpu",
        params: { threshold_percent: 80 },
      }),
    });
    const httpOnTcp = await request("/api/internal/v1/alerts/rules", {
      method: "POST",
      body: JSON.stringify({
        name: "Bad HTTP status",
        monitor_id: "tcp-1",
        condition: "http_status",
        params: { expected_status: 200 },
      }),
    });

    expect(cpuOnHttp.status).toBe(400);
    expect(httpOnTcp.status).toBe(400);

    const count = await db.prepare("SELECT COUNT(*) AS count FROM alert_rules").first("count");
    expect(count).toBe(0);
  });

  async function insertMonitor(id: string, name: string, type: "agent" | "http" | "tcp", config: Record<string, unknown>) {
    const now = Math.floor(Date.now() / 1000);
    await db.prepare(
      `INSERT INTO monitors (
         id, backend_id, name, type, target, interval_sec, timeout_sec,
         expected_json, config_json, paused, public_visible, created_at, updated_at
       ) VALUES (?, 'default', ?, ?, ?, 60, 10, NULL, ?, 0, 1, ?, ?)`,
    ).bind(id, name, type, type === "agent" ? "Agent probe" : name, JSON.stringify(config), now, now).run();
  }
});
