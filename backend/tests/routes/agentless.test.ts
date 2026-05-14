import { describe, expect, it, beforeEach } from "vitest";
import { env } from "cloudflare:workers";
import { sign } from "hono/jwt";
import app from "../../src/index";
import { runDueAgentlessChecks } from "../../src/agentless/checks";

describe("Agentless Routes (/api/agentless)", () => {
  let testEnv: any;
  let adminToken: string;

  beforeEach(async () => {
    testEnv = {
      ...env,
      API_SECRET_KEY: "test_admin_key",
      JWT_AUDIENCE: "test_aud",
      JWT_ISSUER: "test_iss",
      SESSION_BLACKLIST: {
        store: new Map(),
        async get(key: string) { return this.store.get(key) || null; },
      },
    };

    const db = (env as any).DB;
    await db.prepare("DELETE FROM raw_metrics").run();
    await db.prepare("DELETE FROM nodes").run();
    await db.prepare("DELETE FROM refresh_tokens").run();

    const sessionId = crypto.randomUUID();
    await db.prepare("INSERT INTO refresh_tokens (token_hash, session_id, status, expires_at) VALUES ('agentlesshash', ?, 'active', 9999999999)")
      .bind(sessionId)
      .run();

    adminToken = await sign({
      session_id: sessionId,
      role: "admin",
      aud: "test_aud",
      iss: "test_iss",
      exp: Math.floor(Date.now() / 1000) + 3600,
    }, testEnv.API_SECRET_KEY);
  });

  const request = (path: string, init: RequestInit = {}) => app.fetch(
    new Request(`http://localhost${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json", ...init.headers },
    }),
    testEnv,
  );

  it("creates HTTP checks with Phase 10 minimum fields", async () => {
    const res = await request("/api/agentless/http", {
      method: "POST",
      body: JSON.stringify({ name: "Homepage", url: "https://example.com", interval: 300, timeout: 10, expected_status: 200 }),
    });

    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.data.type).toBe("agentless_http");
    expect(body.data.config).toEqual({ url: "https://example.com", interval: 300, timeout: 10, expected_status: 200 });
  });

  it("rejects duplicate active Agentless check names", async () => {
    const payload = { name: "Duplicate Check", url: "https://example.com", interval: 300, timeout: 10, expected_status: 200 };
    const first = await request("/api/agentless/http", { method: "POST", body: JSON.stringify(payload) });
    const second = await request("/api/agentless/http", { method: "POST", body: JSON.stringify(payload) });

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(((await second.json()) as any).error).toContain("already exists");
  });

  it("rejects unsafe HTTP targets before storage", async () => {
    const res = await request("/api/agentless/http", {
      method: "POST",
      body: JSON.stringify({ name: "Loopback HTTP", url: "http://127.0.0.1:8787/health", interval: 300, timeout: 10, expected_status: 200 }),
    });

    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error).toContain("localhost or private network");

    const row = await (env as any).DB.prepare("SELECT id FROM nodes WHERE name = 'Loopback HTTP'").first();
    expect(row).toBeNull();
  });

  it("creates TCP checks but rejects Worker-unsupported TCP targets with a clear 400", async () => {
    const success = await request("/api/agentless/tcp", {
      method: "POST",
      body: JSON.stringify({ name: "Postgres", host: "db.example.com", port: 5432, timeout: 10, interval: 300 }),
    });
    const rejected = await request("/api/agentless/tcp", {
      method: "POST",
      body: JSON.stringify({ name: "Loopback", host: "127.0.0.1", port: 5432, timeout: 10, interval: 300 }),
    });

    expect(success.status).toBe(200);
    expect(((await success.json()) as any).data.type).toBe("agentless_tcp");
    expect(rejected.status).toBe(400);
    expect(((await rejected.json()) as any).error).toContain("loopback");

    const row = await (env as any).DB.prepare("SELECT id FROM nodes WHERE name = 'Loopback'").first();
    expect(row).toBeNull();
  });

  it("lists active checks with latest result fields", async () => {
    const now = Math.floor(Date.now() / 1000);
    await (env as any).DB.prepare(
      "INSERT INTO nodes (id, name, type, status, config_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind("agentless_list_http", "List HTTP", "agentless_http", "online", JSON.stringify({ url: "https://example.com", interval: 300, timeout: 10, expected_status: 200 }), now).run();
    await (env as any).DB.prepare(
      "INSERT INTO raw_metrics (node_id, timestamp, ping_ms, cpu_usage, mem_usage, is_up, error_text) VALUES (?, ?, ?, NULL, NULL, ?, ?)",
    ).bind("agentless_list_http", now, 42, 1, null).run();

    const res = await request("/api/agentless");
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ id: "agentless_list_http", latest_ping_ms: 42, latest_is_up: 1, latest_error_text: null });
    expect(body.data[0].target).toBe("https://example.com");
    expect(body.data[0].latest_result).toEqual({ timestamp: now, is_up: true, latency_ms: 42, error_text: null });
  });

  it("records a failed result when a due Agentless fetch throws", async () => {
    const now = Math.floor(Date.now() / 1000);
    const id = "agentless_throwing_http";
    await (env as any).DB.prepare(
      "INSERT INTO nodes (id, name, type, status, config_json, last_heartbeat) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(id, "Throwing HTTP", "agentless_http", "offline", JSON.stringify({ url: "https://example.com", interval: 300, timeout: 10, expected_status: 200 }), null).run();

    const count = await runDueAgentlessChecks(testEnv, now, {
      fetchImpl: (() => { throw new Error("fetch exploded"); }) as any,
    });

    expect(count).toBeGreaterThanOrEqual(1);
    const metric: any = await (env as any).DB.prepare("SELECT is_up, error_text FROM raw_metrics WHERE node_id = ? ORDER BY id DESC LIMIT 1")
      .bind(id)
      .first();
    expect(metric.is_up).toBe(0);
    expect(metric.error_text).toContain("fetch exploded");
  });

  it("pauses, resumes, and archives checks using safe lifecycle semantics", async () => {
    const created = await request("/api/agentless/http", {
      method: "POST",
      body: JSON.stringify({ name: "Lifecycle", url: "https://example.com", interval: 300, timeout: 10, expected_status: 200 }),
    });
    const id = ((await created.json()) as any).data.id;

    const paused = await request(`/api/agentless/${id}/pause`, { method: "POST" });
    const resumed = await request(`/api/agentless/${id}/resume`, { method: "POST" });
    const deleted = await request(`/api/agentless/${id}`, { method: "DELETE" });

    expect(paused.status).toBe(200);
    expect(((await paused.json()) as any).data.status).toBe("paused");
    expect(resumed.status).toBe(200);
    expect(((await resumed.json()) as any).data.status).toBe("offline");
    expect(deleted.status).toBe(200);
    expect(((await deleted.json()) as any).data.archived_at).toEqual(expect.any(Number));
  });
});
