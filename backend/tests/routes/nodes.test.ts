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
      PROBE_PUSH_URL: "https://uptime-lofi-probe.example.workers.dev",
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

  it("4. Generates probe config without exposing the master secret", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/nodes/probe-config", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "prod-vps-1", platform: "linux/amd64" }),
      }),
      testEnv,
    );

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("test_admin_key");

    const body = JSON.parse(text) as any;
    expect(body.data.node_id).toEqual(expect.any(String));
    expect(body.data.node_name).toBe("prod-vps-1");
    expect(body.data.node_secret).toEqual(expect.any(String));
    expect(body.data.probe_push_url).toBe("https://uptime-lofi-probe.example.workers.dev");
    expect(body.data.config_yaml).toContain("node_id:");
    expect(body.data.config_yaml).toContain("psk:");
    expect(body.data.downloads.linux_amd64).toContain("probe-linux-amd64.tar.gz");

    const row = await (env as any).DB.prepare("SELECT * FROM nodes WHERE id = ?")
      .bind(body.data.node_id)
      .first();
    expect(row.name).toBe("prod-vps-1");
    expect(row.type).toBe("agent_push");
    expect(row.status).toBe("offline");
    expect(row.salt).toEqual(expect.any(String));
  });

  it("5. Rejects empty probe names", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/nodes/probe-config", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "   " }),
      }),
      testEnv,
    );

    expect(res.status).toBe(400);
  });
});
