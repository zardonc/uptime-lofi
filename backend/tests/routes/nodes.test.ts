import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { env } from "cloudflare:workers";
import app from "../../src/index";
import { sign } from "hono/jwt";

describe("Nodes Routes (/api/nodes)", () => {
  let testEnv: any;
  let adminToken: string;
  const nodeId = "test_node_api";

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

    // Create a mock active session
    const sessionId = crypto.randomUUID();
    await db.prepare("INSERT INTO refresh_tokens (token_hash, session_id, status, expires_at) VALUES ('nohash', ?, 'active', 9999999999)").bind(sessionId).run();

    adminToken = await sign({
      session_id: sessionId,
      role: 'admin',
      aud: "test_aud",
      iss: "test_iss",
      exp: Math.floor(Date.now() / 1000) + 3600
    }, testEnv.API_SECRET_KEY);

    // Insert test data
    await db.prepare("INSERT INTO nodes (id, name, type, salt, status) VALUES (?, ?, ?, ?, ?)")
      .bind(nodeId, "API Node Test", "vps", "salt123", "online")
      .run();

    const ts = Math.floor(Date.now() / 1000);
    await db.prepare(
      `INSERT INTO raw_metrics (node_id, timestamp, ping_ms, cpu_usage, mem_usage, is_up) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(nodeId, ts, 45, 12.5, 33.3, 1).run();
  });

  afterAll(async () => {
    const db = (env as any).DB;
    await db.prepare("DELETE FROM nodes").run();
    await db.prepare("DELETE FROM raw_metrics").run();
    await db.prepare("DELETE FROM refresh_tokens").run();
  });

  it("1. List nodes (authenticated) — returns node list", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/nodes", {
        headers: { "Authorization": `Bearer ${adminToken}` }
      }),
      testEnv
    );
    expect(res.status).toBe(200);
    const nodes: any = await res.json();
    expect(Array.isArray(nodes.data)).toBe(true);
    expect(nodes.data.length).toBe(1);
    expect(nodes.data[0].id).toBe(nodeId);
    expect(nodes.data[0].status).toBe("online");
  });

  it("2. GET specific node with metrics", async () => {
    const res = await app.fetch(
      new Request(`http://localhost/api/nodes/${nodeId}/metrics?hours=1`, {
        headers: { "Authorization": `Bearer ${adminToken}` }
      }),
      testEnv
    );
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data.length).toBe(1);
    expect(data.data[0].cpu_usage).toBe(12.5);
  });

  it("3. Unauthenticated GET /api/nodes returns 401", async () => {
    const res = await app.fetch(new Request("http://localhost/api/nodes"), testEnv);
    expect(res.status).toBe(401);
  });
});
