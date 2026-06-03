import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { env } from "cloudflare:workers";
import app from "../../src/index";
import { sign } from "hono/jwt";

describe("Settings Routes (/api/settings)", () => {
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
    await db.prepare("DELETE FROM kv_settings").run();
    await db.prepare("DELETE FROM refresh_tokens").run();
    await db.prepare("DELETE FROM monitor_latest").run();
    await db.prepare("DELETE FROM agent_metrics").run();
    await db.prepare("DELETE FROM check_results").run();
    await db.prepare("DELETE FROM monitors").run();

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
    await db.prepare("DELETE FROM kv_settings").run();
    await db.prepare("DELETE FROM refresh_tokens").run();
    await db.prepare("DELETE FROM monitor_latest").run();
    await db.prepare("DELETE FROM agent_metrics").run();
    await db.prepare("DELETE FROM check_results").run();
    await db.prepare("DELETE FROM monitors").run();
  });

  it("1. Disable security — updates UI lock to false", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/settings/security", {
        method: "POST",
        headers: { 
          "Authorization": `Bearer ${adminToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ enabled: false })
      }),
      testEnv
    );
    expect(res.status).toBe(200);
    
    // Verify kv_settings
    const uiLockStr = await (env as any).DB.prepare("SELECT value FROM kv_settings WHERE key = 'ui_lock_enabled'").first("value");
    expect(uiLockStr).toBe("false");
  });

  it("2. Enable security missing password — returns 400", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/settings/security", {
        method: "POST",
        headers: { 
          "Authorization": `Bearer ${adminToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ enabled: true })
      }),
      testEnv
    );
    expect(res.status).toBe(400);
  });

  it("3. Enable security with password — sets hash, salt and enabled true", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/settings/security", {
        method: "POST",
        headers: { 
          "Authorization": `Bearer ${adminToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ enabled: true, password: "new_secure_password" })
      }),
      testEnv
    );
    expect(res.status).toBe(200);

    const db = (env as any).DB;
    const isEnabled = await db.prepare("SELECT value FROM kv_settings WHERE key = 'ui_lock_enabled'").first("value");
    expect(isEnabled).toBe("true");

    const hash = await db.prepare("SELECT value FROM kv_settings WHERE key = 'ui_lock_hash'").first("value");
    expect(hash).toBeDefined();

    const salt = await db.prepare("SELECT value FROM kv_settings WHERE key = 'ui_lock_salt'").first("value");
    expect(salt).toBeDefined();
  });

  it("4. Unauthenticated POST /api/settings/security returns 401", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/settings/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false })
      }), 
      testEnv
    );
    expect(res.status).toBe(401);
  });

  it("5. Saves Public Status visibility and returns updated monitor visibility", async () => {
    const db = (env as any).DB;
    await db.prepare(
      `INSERT INTO monitors (
         id, backend_id, name, type, target, interval_sec, timeout_sec,
         expected_json, config_json, paused, public_visible, created_at, updated_at
       ) VALUES ('public-toggle-http', 'default', 'Public Toggle HTTP', 'http', 'https://example.com', 60, 10, '{}', '{"url":"https://example.com","expected_status":200}', 0, 0, 1, 1)`,
    ).run();

    const res = await app.fetch(
      new Request("http://localhost/api/settings/public-status", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          enabled: true,
          private_slug: null,
          show_uptime: true,
          show_latency: true,
          show_incidents: true,
          show_monitor_type: true,
          monitors: [{ id: "public-toggle-http", public_visible: true }],
        }),
      }),
      testEnv,
    );

    const body = await res.json() as any;
    expect(res.status).toBe(200);
    expect(body.data.monitors).toContainEqual({ id: "public-toggle-http", public_visible: true });
    const visible = await db.prepare("SELECT public_visible FROM monitors WHERE id = 'public-toggle-http'").first("public_visible");
    expect(visible).toBe(1);
  });
});
