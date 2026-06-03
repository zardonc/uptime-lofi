import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { env } from "cloudflare:workers";
import probeApp from "../../src/probe-index";

async function derivePsk(masterSecret: string, monitorId: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(masterSecret);
  const msgData = encoder.encode(`${monitorId}:${salt}`);
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
  const monitorId = "docker_path_monitor";
  const salt = "docker_path_salt";
  const masterSecret = "test_admin_key";
  let testEnv: any;
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
    await db.prepare("DELETE FROM monitor_latest").run();
    await db.prepare("DELETE FROM agent_metrics").run();
    await db.prepare("DELETE FROM monitors").run();
    await db.prepare("DELETE FROM refresh_tokens").run();

    await db.prepare(
      `INSERT INTO monitors (
         id, backend_id, name, type, target, interval_sec, timeout_sec,
         config_json, salt, paused, public_visible
       ) VALUES (?, 'default', ?, 'agent', 'Agent probe', 60, 10, '{}', ?, 0, 1)`,
    )
      .bind(monitorId, "Docker Path Monitor", salt)
      .run();

    psk = await derivePsk(masterSecret, monitorId, salt);
  });

  afterAll(async () => {
    const db = (env as any).DB;
    await db.prepare("DELETE FROM monitor_latest").run();
    await db.prepare("DELETE FROM agent_metrics").run();
    await db.prepare("DELETE FROM monitors").run();
    await db.prepare("DELETE FROM refresh_tokens").run();
  });

  it("stores signed containers_json in agent metric payloads", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const containers = [{ id: "abc1234567", name: "/web", image: "nginx:1.27", state: "running", status: "Up 5 minutes" }];
    const pushBody = JSON.stringify([{ monitor_id: monitorId, timestamp, ping: 42, cpu: 18.5, mem: 44.2, is_up: true, containers_json: JSON.stringify(containers) }]);
    const signature = await signProbePayload(psk, timestamp, pushBody);

    const pushRes = await probeApp.fetch(new Request("http://localhost/api/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${signature}`,
        "X-Monitor-Id": monitorId,
        "X-Timestamp": timestamp.toString(),
        "Content-Type": "application/json",
      },
      body: pushBody,
    }), testEnv);

    expect(pushRes.status).toBe(200);
    const stored = await (env as any).DB.prepare("SELECT payload_json FROM agent_metrics WHERE monitor_id = ? ORDER BY id DESC LIMIT 1")
      .bind(monitorId)
      .first();
    const payload = JSON.parse(stored.payload_json);
    expect(payload.monitor_id).toBe(monitorId);
    expect(payload.containers_json).toEqual(expect.stringMatching(/^gz:/));
  });
});
