import { describe, it, expect, beforeAll } from "vitest";
import { Hono } from "hono";
import { env } from "cloudflare:workers";
import { probeAuthMiddleware } from "../../src/middleware/auth";

// Helper to generate HMAC expected signature
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

// Derive PSK just like middleware
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

describe("Probe Auth Middleware (HMAC)", () => {
  const app = new Hono<{ Bindings: any }>();
  app.use("*", probeAuthMiddleware);
  app.post("/push", (c) => c.json({ success: true }));

  const monitorId = "auth_test_monitor";
  const salt = "random_salt_123";
  let masterSecret: string;
  let psk: string;

  beforeAll(async () => {
    // Insert a test monitor
    await (env as any).DB.prepare(
      `INSERT INTO monitors (
         id, backend_id, name, type, target, interval_sec, timeout_sec,
         config_json, salt, paused, public_visible
       ) VALUES (?, 'default', ?, 'agent', 'Agent probe', 60, 10, '{}', ?, 0, 1)`
    )
      .bind(monitorId, "Auth Monitor Test", salt)
      .run();

    masterSecret = (env as any).API_SECRET_KEY || "default_test_secret";
    psk = await derivePsk(masterSecret, monitorId, salt);
  });

  it("Passes with valid X-Signature", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const bodyObj = { cpu: 50 };
    const bodyStr = JSON.stringify(bodyObj);
    const signature = await generateSignature(psk, timestamp, bodyStr);

    const req = new Request("http://localhost/push", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${signature}`,
        "X-Monitor-Id": monitorId,
        "X-Timestamp": timestamp.toString(),
      },
      body: bodyStr,
    });

    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    const json = await res.json() as { success: boolean };
    expect(json.success).toBe(true);
  });

  it("Fails with invalid signature", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const bodyStr = JSON.stringify({ cpu: 50 });
    const signature = await generateSignature("wrong_psk", timestamp, bodyStr);

    const req = new Request("http://localhost/push", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${signature}`,
        "X-Monitor-Id": monitorId,
        "X-Timestamp": timestamp.toString(),
      },
      body: bodyStr,
    });

    const res = await app.fetch(req, env);
    expect(res.status).toBe(401);
  });

  it("Fails if X-Signature (Authorization Bearer) is missing", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const req = new Request("http://localhost/push", {
      method: "POST",
      headers: {
        "X-Monitor-Id": monitorId,
        "X-Timestamp": timestamp.toString(),
      },
      body: "{}",
    });

    const res = await app.fetch(req, env);
    expect(res.status).toBe(401);
  });

  it("Fails if X-Monitor-Id is missing", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const bodyStr = "{}";
    const signature = await generateSignature(psk, timestamp, bodyStr);

    const req = new Request("http://localhost/push", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${signature}`,
        "X-Timestamp": timestamp.toString(),
      },
      body: bodyStr,
    });

    const res = await app.fetch(req, env);
    expect(res.status).toBe(401);
  });

  it("Fails on replay protection (stale timestamp)", async () => {
    const staleTimestamp = Math.floor(Date.now() / 1000) - 300; // 5 mins ago
    const bodyStr = "{}";
    const signature = await generateSignature(psk, staleTimestamp, bodyStr);

    const req = new Request("http://localhost/push", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${signature}`,
        "X-Monitor-Id": monitorId,
        "X-Timestamp": staleTimestamp.toString(),
      },
      body: bodyStr,
    });

    const res = await app.fetch(req, env);
    expect(res.status).toBe(401);
  });

  it("Fails on future timestamp (clock skew)", async () => {
    const futureTimestamp = Math.floor(Date.now() / 1000) + 300; // 5 mins future
    const bodyStr = "{}";
    const signature = await generateSignature(psk, futureTimestamp, bodyStr);

    const req = new Request("http://localhost/push", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${signature}`,
        "X-Monitor-Id": monitorId,
        "X-Timestamp": futureTimestamp.toString(),
      },
      body: bodyStr,
    });

    const res = await app.fetch(req, env);
    expect(res.status).toBe(401);
  });
});
