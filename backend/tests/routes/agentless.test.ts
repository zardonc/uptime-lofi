import { describe, expect, it, beforeEach } from "vitest";
import { env } from "cloudflare:workers";
import { sign } from "hono/jwt";
import app from "../../src/index";

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
    await db.prepare("DELETE FROM monitor_latest").run();
    await db.prepare("DELETE FROM check_results").run();
    await db.prepare("DELETE FROM monitors").run();
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
    expect(body.data.type).toBe("http");
    expect(body.data.target).toBe("https://example.com");
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

    const row = await (env as any).DB.prepare("SELECT id FROM monitors WHERE name = 'Loopback HTTP'").first();
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
    expect(((await success.json()) as any).data.type).toBe("tcp");
    expect(rejected.status).toBe(400);
    expect(((await rejected.json()) as any).error).toContain("loopback");

    const row = await (env as any).DB.prepare("SELECT id FROM monitors WHERE name = 'Loopback'").first();
    expect(row).toBeNull();
  });

  it("lists active checks with latest result fields", async () => {
    const now = Math.floor(Date.now() / 1000);
    await (env as any).DB.prepare(
      `INSERT INTO monitors (
         id, backend_id, name, type, target, interval_sec, timeout_sec,
         expected_json, config_json, paused, public_visible, created_at, updated_at
       ) VALUES (?, 'default', ?, 'http', ?, 300, 10, ?, ?, 0, 1, ?, ?)`,
    ).bind("agentless_list_http", "List HTTP", "https://example.com", JSON.stringify({ status_code: 200 }), JSON.stringify({ url: "https://example.com", expected_status: 200 }), now, now).run();
    await (env as any).DB.prepare(
      "INSERT INTO monitor_latest (monitor_id, status, checked_at, latency_ms, uptime_ratio, error_text, updated_at) VALUES (?, 'online', ?, ?, 100, NULL, ?)",
    ).bind("agentless_list_http", now, 42, now).run();

    const res = await request("/api/agentless");
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ id: "agentless_list_http", latest_ping_ms: 42, latest_is_up: true, latest_error_text: null });
    expect(body.data[0].target).toBe("https://example.com");
    expect(body.data[0].latest_result).toEqual({ timestamp: now, is_up: true, latency_ms: 42, error_text: null });
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
    expect(((await resumed.json()) as any).data.status).toBe("unknown");
    expect(deleted.status).toBe(200);
    expect(((await deleted.json()) as any).data.archived_at).toEqual(expect.any(Number));
  });
});
