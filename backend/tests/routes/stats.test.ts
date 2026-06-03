import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { env } from "cloudflare:workers";
import app from "../../src/index";
import { sign } from "hono/jwt";

describe("Stats Routes (/api/stats)", () => {
  let testEnv: any;
  let adminToken: string;

  beforeAll(async () => {
    testEnv = { 
      ...env, 
      API_SECRET_KEY: "test_admin_key",
      JWT_AUDIENCE: "test_aud",
      JWT_ISSUER: "test_iss",
      SESSION_BLACKLIST: {
        store: new Map(),
        async get(key: string) { return this.store.get(key) || null; }
      }
    };

    const db = (env as any).DB;
    await db.prepare("DELETE FROM monitor_latest").run();
    await db.prepare("DELETE FROM check_results").run();
    await db.prepare("DELETE FROM daily_summaries").run();
    await db.prepare("DELETE FROM monitors").run();
    await db.prepare("DELETE FROM refresh_tokens").run();

    const sessionId = crypto.randomUUID();
    await db.prepare("INSERT INTO refresh_tokens (token_hash, session_id, status, expires_at) VALUES ('nohash', ?, 'active', 9999999999)").bind(sessionId).run();

    adminToken = await sign({
      session_id: sessionId,
      role: 'admin',
      aud: "test_aud",
      iss: "test_iss",
      exp: Math.floor(Date.now() / 1000) + 3600
    }, testEnv.API_SECRET_KEY);
  });

  afterAll(async () => {
    const db = (env as any).DB;
    await db.prepare("DELETE FROM monitor_latest").run();
    await db.prepare("DELETE FROM check_results").run();
    await db.prepare("DELETE FROM daily_summaries").run();
    await db.prepare("DELETE FROM monitors").run();
    await db.prepare("DELETE FROM refresh_tokens").run();
  });

  it("1. Overview empty DB — returns zero counts", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/stats/overview", {
        headers: { "Authorization": `Bearer ${adminToken}` }
      }),
      testEnv
    );
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.data.totalMonitors).toBe(0);
    expect(json.data.onlineMonitors).toBe(0);
  });

  it("2. Overview with data — returns aggregated stats", async () => {
    const db = (env as any).DB;
    await db.prepare("DELETE FROM monitor_latest").run();
    await db.prepare("DELETE FROM monitors").run();
    const now = Math.floor(Date.now() / 1000);
    await db.prepare("INSERT INTO monitors (id, name, type, target, interval_sec, timeout_sec, config_json) VALUES (?, ?, 'agent', 'Agent probe', 60, 10, '{}')")
      .bind("monitor_a", "Monitor A").run();
    await db.prepare("INSERT INTO monitors (id, name, type, target, interval_sec, timeout_sec, config_json) VALUES (?, ?, 'http', 'https://example.com', 60, 10, '{\"url\":\"https://example.com\"}')")
      .bind("monitor_b", "Monitor B").run();
    await db.prepare("INSERT INTO monitors (id, name, type, target, interval_sec, timeout_sec, config_json, archived_at) VALUES (?, ?, 'agent', 'Agent probe', 60, 10, '{}', ?)")
      .bind("monitor_archived", "Archived", now).run();
    await db.prepare("INSERT INTO monitor_latest (monitor_id, status, checked_at, updated_at) VALUES (?, 'online', ?, ?)")
      .bind("monitor_a", now, now).run();
    await db.prepare("INSERT INTO monitor_latest (monitor_id, status, checked_at, updated_at) VALUES (?, 'offline', ?, ?)")
      .bind("monitor_b", now, now).run();

    const res = await app.fetch(
      new Request("http://localhost/api/stats/overview", {
        headers: { "Authorization": `Bearer ${adminToken}` }
      }),
      testEnv
    );
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.data.totalMonitors).toBe(2);
    expect(json.data.onlineMonitors).toBe(1);
  });

  it("3. Unauthenticated GET /api/stats/overview returns 401", async () => {
    const res = await app.fetch(new Request("http://localhost/api/stats/overview"), testEnv);
    expect(res.status).toBe(401);
  });

  it("4. Counts recently batched probe monitors as online", async () => {
    const db = (env as any).DB;
    const now = Math.floor(Date.now() / 1000);
    await db.prepare("DELETE FROM monitor_latest").run();
    await db.prepare("DELETE FROM monitors").run();
    await db.prepare("INSERT INTO monitors (id, name, type, target, interval_sec, timeout_sec, config_json) VALUES (?, ?, 'agent', 'Agent probe', 60, 10, '{}')")
      .bind("batched_monitor", "Batched Monitor").run();
    await db.prepare("INSERT INTO monitor_latest (monitor_id, status, checked_at, updated_at) VALUES (?, 'online', ?, ?)")
      .bind("batched_monitor", now - 300, now - 300).run();

    const res = await app.fetch(
      new Request("http://localhost/api/stats/overview", {
        headers: { "Authorization": `Bearer ${adminToken}` }
      }),
      testEnv
    );
    const json: any = await res.json();
    expect(json.data.onlineMonitors).toBe(1);
  });
});
