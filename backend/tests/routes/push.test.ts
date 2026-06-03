import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { env } from "cloudflare:workers";
import probeApp from "../../src/probe-index";

// Helpers
async function derivePsk(masterSecret: string, monitorId: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(masterSecret);
  const msgData = encoder.encode(`${monitorId}:${salt}`);

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
  const monitorId = "test_monitor_push";
  const salt = "salt_for_push_123";
  let psk: string;

  beforeAll(async () => {
    testEnv = { 
      ...env, 
      API_SECRET_KEY: "test_admin_key"
    };

    const db = (env as any).DB;
    await db.prepare("DELETE FROM monitor_latest").run();
    await db.prepare("DELETE FROM agent_metrics").run();
    await db.prepare("DELETE FROM check_results").run();
    await db.prepare("DELETE FROM monitors").run();
    await db.prepare(
      `INSERT INTO monitors (
         id, backend_id, name, type, target, interval_sec, timeout_sec,
         expected_json, config_json, salt, paused, public_visible, created_at, updated_at
       ) VALUES (?, 'default', ?, 'agent', 'Agent probe', 60, 10, NULL, ?, ?, 0, 1, ?, ?)`,
    ).bind(monitorId, "Push Agent Monitor", JSON.stringify({ platform: "linux/amd64" }), salt, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).run();

    psk = await derivePsk(testEnv.API_SECRET_KEY, monitorId, salt);
  });

  afterAll(async () => {
    const db = (env as any).DB;
    await db.prepare("DELETE FROM monitor_latest").run();
    await db.prepare("DELETE FROM agent_metrics").run();
    await db.prepare("DELETE FROM monitors").run();
  });

  const getPushRequest = async (metrics: any[], timestamp?: number) => {
    const ts = timestamp ?? Math.floor(Date.now() / 1000);
    const bodyStr = JSON.stringify(metrics);
    const signature = await generateSignature(psk, ts, bodyStr);

    return new Request("http://localhost/api/push", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${signature}`,
        "X-Monitor-Id": monitorId,
        "X-Timestamp": ts.toString(),
        "Content-Type": "application/json"
      },
      body: bodyStr,
    });
  };

  it("1. Valid batch push stores agent metric data and updates monitor latest state", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const payload = [{
      monitor_id: monitorId,
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

    const agentMetric = await (env as any).DB.prepare("SELECT * FROM agent_metrics WHERE monitor_id = ?").bind(monitorId).first();
    expect(agentMetric).toMatchObject({
      monitor_id: monitorId,
      timestamp: ts,
      cpu_percent: 10,
      mem_percent: 20,
    });

    const latest = await (env as any).DB.prepare("SELECT * FROM monitor_latest WHERE monitor_id = ?").bind(monitorId).first();
    expect(latest).toMatchObject({
      monitor_id: monitorId,
      status: "online",
      checked_at: ts,
      latency_ms: 45,
      cpu_percent: 10,
      mem_percent: 20,
    });
  });

  it("2. Invalid Zod schema missing required fields", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const payload = [{
      monitor_id: monitorId,
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
        "X-Monitor-Id": monitorId,
        "X-Timestamp": Math.floor(Date.now()/1000).toString(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify([{ monitor_id: monitorId, timestamp: Math.floor(Date.now()/1000), cpu: 5, mem: 10, is_up: true }]),
    });

    const res = await probeApp.fetch(req, testEnv);
    expect(res.status).toBe(401);
  });

  it("5. Rejects archived probe monitors before writing metrics", async () => {
    const ts = Math.floor(Date.now() / 1000);
    await (env as any).DB.prepare("UPDATE monitors SET archived_at = ?, paused = 1 WHERE id = ?")
      .bind(ts, monitorId)
      .run();

    const before = await (env as any).DB.prepare("SELECT count(*) as c FROM agent_metrics WHERE monitor_id = ?")
      .bind(monitorId)
      .first("c");

    const req = await getPushRequest([{ monitor_id: monitorId, timestamp: ts, ping: 45, cpu: 10, mem: 20, is_up: true }], ts);
    const res = await probeApp.fetch(req, testEnv);

    expect(res.status).toBe(401);
    const after = await (env as any).DB.prepare("SELECT count(*) as c FROM agent_metrics WHERE monitor_id = ?")
      .bind(monitorId)
      .first("c");
    expect(after).toBe(before);
  });
});
