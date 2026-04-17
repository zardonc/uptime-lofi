import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { env } from "cloudflare:workers";
import probeApp from "../../src/probe-index";

// Helpers
async function derivePsk(masterSecret: string, nodeId: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(masterSecret);
  const msgData = encoder.encode(`${nodeId}:${salt}`);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  const sigArray = Array.from(new Uint8Array(sigBuffer));
  return sigArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function generateSignature(psk: string, timestamp: number, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(psk);
  const msgData = encoder.encode(`${timestamp}.${body}`);
  
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  const sigArray = Array.from(new Uint8Array(sigBuffer));
  return sigArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

describe("Push Routes (/api/push)", () => {
  let testEnv: any;
  const nodeId = "test_node_push";
  const salt = "salt_for_push_123";
  let psk: string;

  beforeAll(async () => {
    testEnv = { 
      ...env, 
      API_SECRET_KEY: "test_admin_key"
    };

    const db = (env as any).DB;
    await db.prepare("DELETE FROM raw_metrics").run();
    await db.prepare("DELETE FROM nodes").run();
    await db.prepare("INSERT INTO nodes (id, name, type, salt, status) VALUES (?, ?, ?, ?, ?)")
      .bind(nodeId, "Push Node", "vps", salt, "online")
      .run();

    psk = await derivePsk(testEnv.API_SECRET_KEY, nodeId, salt);
  });

  afterAll(async () => {
    const db = (env as any).DB;
    await db.prepare("DELETE FROM raw_metrics").run();
    await db.prepare("DELETE FROM nodes").run();
  });

  const getPushRequest = async (metrics: any[], timestamp?: number) => {
    const ts = timestamp ?? Math.floor(Date.now() / 1000);
    const bodyStr = JSON.stringify(metrics);
    const signature = await generateSignature(psk, ts, bodyStr);

    return new Request("http://localhost/api/push", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${signature}`,
        "X-Node-Id": nodeId,
        "X-Timestamp": ts.toString(),
        "Content-Type": "application/json"
      },
      body: bodyStr,
    });
  };

  it("1. Valid batch push stores data in raw_metrics and updates node status", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const payload = [{
      node_id: nodeId,
      timestamp: ts,
      ping: 45,
      cpu: 10,
      mem: 20,
      is_up: true
    }];

    const req = await getPushRequest(payload, ts);
    const res = await probeApp.fetch(req, testEnv);
    expect(res.status).toBe(200);

    const json: any = await res.json();
    expect(json.status).toBe("success");
    expect(json.received).toBe(1);

    // Verify raw_metrics
    const metricsCount = await (env as any).DB.prepare("SELECT count(*) as c FROM raw_metrics WHERE node_id = ?").bind(nodeId).first("c");
    expect(metricsCount).toBe(1);

    // Verify nodes table
    const nodeRecord = await (env as any).DB.prepare("SELECT status, last_heartbeat FROM nodes WHERE id = ?").bind(nodeId).first();
    expect(nodeRecord.status).toBe("online");
    expect(nodeRecord.last_heartbeat).toBe(ts);
  });

  it("2. Invalid Zod schema missing required fields", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const payload = [{
      node_id: nodeId,
      timestamp: ts,
      // missing cpu, mem, is_up
    }];

    const req = await getPushRequest(payload, ts);
    const res = await probeApp.fetch(req, testEnv);
    expect(res.status).toBe(400);

    const json: any = await res.json();
    expect(json.error).toContain("Malformed payload format");
  });

  it("3. Empty batch push", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const payload: any[] = []; // empty array

    const req = await getPushRequest(payload, ts);
    const res = await probeApp.fetch(req, testEnv);
    expect(res.status).toBe(200);

    const json: any = await res.json();
    expect(json.status).toBe("ignored");
  });

  it("4. Fails if missing HMAC auth", async () => {
    const req = new Request("http://localhost/api/push", {
      method: "POST",
      headers: {
        "X-Node-Id": nodeId,
        "X-Timestamp": Math.floor(Date.now()/1000).toString(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify([{ node_id: nodeId, timestamp: Math.floor(Date.now()/1000), cpu: 5, mem: 10, is_up: true }]),
    });

    const res = await probeApp.fetch(req, testEnv);
    expect(res.status).toBe(401);
  });
});
