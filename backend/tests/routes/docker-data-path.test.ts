import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { env } from "cloudflare:workers";
import { sign } from "hono/jwt";
import app from "../../src/index";
import probeApp from "../../src/probe-index";

async function derivePsk(masterSecret: string, nodeId: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(masterSecret);
  const msgData = encoder.encode(`${nodeId}:${salt}`);
  const cryptoKey = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  return Array.from(new Uint8Array(sigBuffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signProbePayload(psk: string, timestamp: number, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(psk);
  const msgData = encoder.encode(`${timestamp}.${body}`);
  const cryptoKey = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  return Array.from(new Uint8Array(sigBuffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("Docker container data path", () => {
  const nodeId = "docker_path_node";
  const salt = "docker_path_salt";
  const masterSecret = "test_admin_key";
  let testEnv: any;
  let adminToken: string;
  let psk: string;

  beforeAll(async () => {
    testEnv = {
      ...env,
      API_SECRET_KEY: masterSecret,
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
    await db.prepare("INSERT INTO refresh_tokens (token_hash, session_id, status, expires_at) VALUES ('dockerhash', ?, 'active', 9999999999)")
      .bind(sessionId)
      .run();

    adminToken = await sign({
      session_id: sessionId,
      role: "admin",
      aud: "test_aud",
      iss: "test_iss",
      exp: Math.floor(Date.now() / 1000) + 3600,
    }, masterSecret);

    await db.prepare("INSERT INTO nodes (id, name, type, salt, status) VALUES (?, ?, ?, ?, ?)")
      .bind(nodeId, "Docker Path Node", "agent_push", salt, "offline")
      .run();

    psk = await derivePsk(masterSecret, nodeId, salt);
  });

  afterAll(async () => {
    const db = (env as any).DB;
    await db.prepare("DELETE FROM raw_metrics").run();
    await db.prepare("DELETE FROM nodes").run();
    await db.prepare("DELETE FROM refresh_tokens").run();
  });

  it("stores signed containers_json and exposes parsed containers from metrics", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const containers = [{ id: "abc1234567", name: "/web", image: "nginx:1.27", state: "running", status: "Up 5 minutes" }];
    const pushBody = JSON.stringify([{ node_id: nodeId, timestamp, ping: 42, cpu: 18.5, mem: 44.2, is_up: true, containers_json: JSON.stringify(containers) }]);
    const signature = await signProbePayload(psk, timestamp, pushBody);

    const pushRes = await probeApp.fetch(new Request("http://localhost/api/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${signature}`,
        "X-Node-Id": nodeId,
        "X-Timestamp": timestamp.toString(),
        "Content-Type": "application/json",
      },
      body: pushBody,
    }), testEnv);

    expect(pushRes.status).toBe(200);
    const stored = await (env as any).DB.prepare("SELECT containers_json FROM raw_metrics WHERE node_id = ? ORDER BY id DESC LIMIT 1")
      .bind(nodeId)
      .first();
    expect(stored.containers_json).toEqual(expect.stringMatching(/^gz:/));

    const listRes = await app.fetch(new Request("http://localhost/api/nodes", {
      headers: { Authorization: `Bearer ${adminToken}` },
    }), testEnv);
    const listBody: any = await listRes.json();
    expect(listBody.data[0].config?.agent?.containers ?? null).toBeNull();

    const metricsRes = await app.fetch(new Request(`http://localhost/api/nodes/${nodeId}/metrics?hours=1`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    }), testEnv);

    expect(metricsRes.status).toBe(200);
    const metricsBody: any = await metricsRes.json();
    expect(metricsBody.data[0].containers[0].name).toBe("/web");
    expect(metricsBody.data[0].containers[0].image).toBe("nginx:1.27");
    expect(metricsBody.data[0].containers[0].state).toBe("running");
    expect(metricsBody.data[0].containers[0].status).toBe("Up 5 minutes");
  });
});
