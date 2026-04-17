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
    await db.prepare("DELETE FROM nodes").run();
    await db.prepare("DELETE FROM raw_metrics").run();
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
    await db.prepare("DELETE FROM nodes").run();
    await db.prepare("DELETE FROM raw_metrics").run();
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
    expect(json.data.totalNodes).toBe(0);
    expect(json.data.onlineNodes).toBe(0);
  });

  it("2. Overview with data — returns aggregated stats", async () => {
    const db = (env as any).DB;
    await db.prepare("INSERT INTO nodes (id, name, type, salt, status) VALUES (?, ?, ?, ?, ?)")
      .bind("node_a", "Node A", "vps", "s1", "online").run();
    
    await db.prepare("INSERT INTO nodes (id, name, type, salt, status) VALUES (?, ?, ?, ?, ?)")
      .bind("node_b", "Node B", "vps", "s2", "offline").run();

    const res = await app.fetch(
      new Request("http://localhost/api/stats/overview", {
        headers: { "Authorization": `Bearer ${adminToken}` }
      }),
      testEnv
    );
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.data.totalNodes).toBe(2);
    expect(json.data.onlineNodes).toBe(1);
  });

  it("3. Unauthenticated GET /api/stats/overview returns 401", async () => {
    const res = await app.fetch(new Request("http://localhost/api/stats/overview"), testEnv);
    expect(res.status).toBe(401);
  });
});
