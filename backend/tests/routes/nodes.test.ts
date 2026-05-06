import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { env } from "cloudflare:workers";
import app from "../../src/index";
import { sign } from "hono/jwt";

describe("Nodes Routes (/api/nodes)", () => {
  let testEnv: any;
  let adminToken: string;
  const nodeId = "test_node_api";
  const archivedNodeId = "archived_node_api";

  beforeAll(async () => {
    testEnv = { 
      ...env, 
      API_SECRET_KEY: "test_admin_key",
      PROBE_PUSH_URL: "https://uptime-lofi-probe.example.workers.dev",
      PROBE_RELEASE_REPO: "example/uptime-lofi",
      PROBE_RELEASE_TAG: "probe-latest",
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

    const ts = Math.floor(Date.now() / 1000);

    // Insert test data
    await db.prepare("INSERT INTO nodes (id, name, type, salt, status) VALUES (?, ?, ?, ?, ?)")
      .bind(nodeId, "API Node Test", "vps", "salt123", "online")
      .run();

    await db.prepare("INSERT INTO nodes (id, name, type, salt, status, archived_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(archivedNodeId, "Archived Node Test", "agent_push", "salt456", "paused", ts)
      .run();

    await db.prepare(
      `INSERT INTO raw_metrics (node_id, timestamp, ping_ms, cpu_usage, mem_usage, is_up) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(nodeId, ts, 45, 12.5, 33.3, 1).run();

    await db.prepare(
      `INSERT INTO raw_metrics (node_id, timestamp, ping_ms, cpu_usage, mem_usage, is_up) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(archivedNodeId, ts, 99, 55.5, 66.6, 0).run();
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
    expect(nodes.data.some((node: any) => node.id === archivedNodeId)).toBe(false);
    expect(nodes.data[0].status).toBe("online");
    expect(nodes.data[0].ping_ms).toBe(45);
    expect(nodes.data[0].cpu_usage).toBe(12.5);
    expect(nodes.data[0].mem_usage).toBe(33.3);
    expect(nodes.data[0].uptime_ratio).toBe(100);
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
    expect(data.data[0].cpu_percent).toBe(12.5);
    expect(data.data[0].mem_percent).toBe(33.3);
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
    expect(body.data.probe_push_url).toBe("https://uptime-lofi-probe.example.workers.dev/api/push");
    expect(body.data.install_script_url).toBe("https://github.com/example/uptime-lofi/releases/download/probe-latest/install-probe.sh");
    expect(body.data.install_command).toContain("UPTIME_PLATFORM='linux/amd64'");
    expect(body.data.install_command).toContain("UPTIME_PROBE_PUSH_URL='https://uptime-lofi-probe.example.workers.dev/api/push'");
    expect(body.data.install_command).toContain(`UPTIME_NODE_ID='${body.data.node_id}'`);
    expect(body.data.install_command).toContain(`UPTIME_NODE_SECRET='${body.data.node_secret}'`);
    expect(body.data.install_command).toContain("releases/download/probe-latest/install-probe.sh");
    expect(body.data.install_command).toContain("UPTIME_RELEASE_REPO='example/uptime-lofi'");
    expect(body.data.install_command).toContain("UPTIME_RELEASE_TAG='probe-latest'");
    expect(body.data.install_command).toContain(" bash");
    expect(body.data.install_command).not.toContain("test_admin_key");
    expect(body.data.config_yaml).toContain("api_url: https://uptime-lofi-probe.example.workers.dev/api/push");
    expect(body.data.config_yaml).toContain("node_id:");
    expect(body.data.config_yaml).toContain("psk:");
    expect(body.data.downloads.linux_amd64).toContain("probe-linux-amd64.tar.gz");
    expect(body.data.downloads.linux_amd64).toContain("example/uptime-lofi/releases/download/probe-latest");

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

  it("6. Creates agentless HTTP nodes offline with validated config", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/nodes", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Homepage HTTP",
          type: "agentless_http",
          config: {
            url: "https://example.com/health",
            interval: 300,
            timeout: 10,
            expected_status: 200,
          },
        }),
      }),
      testEnv,
    );

    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.data.name).toBe("Homepage HTTP");
    expect(body.data.type).toBe("agentless_http");
    expect(body.data.status).toBe("offline");
    expect(body.data.config.url).toBe("https://example.com/health");

    const row = await (env as any).DB.prepare("SELECT status, config_json FROM nodes WHERE id = ?")
      .bind(body.data.id)
      .first();
    expect(row.status).toBe("offline");
    expect(JSON.parse(row.config_json).expected_status).toBe(200);
  });

  it("7. Creates agentless TCP nodes offline with validated config", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/nodes", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Postgres TCP",
          type: "agentless_tcp",
          config: {
            host: "db.example.com",
            port: 5432,
            timeout: 10,
            interval: 300,
          },
        }),
      }),
      testEnv,
    );

    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.data.type).toBe("agentless_tcp");
    expect(body.data.status).toBe("offline");
    expect(body.data.config.host).toBe("db.example.com");
    expect(body.data.config.port).toBe(5432);
  });

  it("8. Safely edits name, paused status, and non-secret config", async () => {
    const editableId = "editable_node_api";
    await (env as any).DB.prepare(
      "INSERT INTO nodes (id, name, type, status, config_json) VALUES (?, ?, ?, ?, ?)"
    ).bind(
      editableId,
      "Editable Node",
      "agentless_http",
      "offline",
      JSON.stringify({ url: "https://old.example.com", interval: 300, timeout: 5, expected_status: 200 }),
    ).run();

    const pauseRes = await app.fetch(
      new Request(`http://localhost/api/nodes/${editableId}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Renamed Node",
          status: "paused",
          config: { url: "https://new.example.com", interval: 600, timeout: 7, expected_status: 204 },
        }),
      }),
      testEnv,
    );

    expect(pauseRes.status).toBe(200);
    const pausedBody: any = await pauseRes.json();
    expect(pausedBody.data.name).toBe("Renamed Node");
    expect(pausedBody.data.status).toBe("paused");
    expect(pausedBody.data.config.expected_status).toBe(204);

    const resumeRes = await app.fetch(
      new Request(`http://localhost/api/nodes/${editableId}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "offline" }),
      }),
      testEnv,
    );

    expect(resumeRes.status).toBe(200);
    const resumedBody: any = await resumeRes.json();
    expect(resumedBody.data.status).toBe("offline");
  });

  it("9. Rejects direct and nested secret fields during node edits", async () => {
    const secretEditId = "secret_edit_node_api";
    await (env as any).DB.prepare(
      "INSERT INTO nodes (id, name, type, status, config_json) VALUES (?, ?, ?, ?, ?)"
    ).bind(
      secretEditId,
      "Secret Edit Node",
      "agentless_http",
      "offline",
      JSON.stringify({ url: "https://example.com", interval: 300, timeout: 5, expected_status: 200 }),
    ).run();

    const directRes = await app.fetch(
      new Request(`http://localhost/api/nodes/${secretEditId}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ node_secret: "leak" }),
      }),
      testEnv,
    );

    const nestedRes = await app.fetch(
      new Request(`http://localhost/api/nodes/${secretEditId}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ config: { url: "https://example.com", psk: "leak" } }),
      }),
      testEnv,
    );

    expect(directRes.status).toBe(400);
    expect(nestedRes.status).toBe(400);
  });

  it("10. Archives a node and preserves raw_metrics history", async () => {
    const deleteId = "delete_node_api";
    const ts = Math.floor(Date.now() / 1000);
    await (env as any).DB.prepare("INSERT INTO nodes (id, name, type, status) VALUES (?, ?, ?, ?)")
      .bind(deleteId, "Delete Node", "agent_push", "online")
      .run();
    await (env as any).DB.prepare(
      "INSERT INTO raw_metrics (node_id, timestamp, ping_ms, cpu_usage, mem_usage, is_up) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(deleteId, ts, 11, 22, 33, 1).run();

    const before = await (env as any).DB.prepare("SELECT COUNT(*) AS count FROM raw_metrics WHERE node_id = ?")
      .bind(deleteId)
      .first();

    const res = await app.fetch(
      new Request(`http://localhost/api/nodes/${deleteId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${adminToken}` },
      }),
      testEnv,
    );

    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.data.id).toBe(deleteId);
    expect(body.data.status).toBe("paused");
    expect(body.data.archived_at).toEqual(expect.any(Number));

    const row = await (env as any).DB.prepare("SELECT archived_at, status FROM nodes WHERE id = ?")
      .bind(deleteId)
      .first();
    const after = await (env as any).DB.prepare("SELECT COUNT(*) AS count FROM raw_metrics WHERE node_id = ?")
      .bind(deleteId)
      .first();

    expect(row.archived_at).toEqual(expect.any(Number));
    expect(row.status).toBe("paused");
    expect(after.count).toBe(before.count);
  });
});
