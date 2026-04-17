import { describe, it, expect, beforeAll } from "vitest";
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { env } from "cloudflare:workers";
import { dashboardAuthMiddleware } from "../../src/middleware/dashboardAuth";

describe("Dashboard Auth Middleware (JWT)", () => {
  const app = new Hono<{ Bindings: any }>();
  app.use("*", dashboardAuthMiddleware);
  app.get("/protected", (c) => c.json({ success: true, payload: c.get("jwtPayload") }));

  let secret: string;
  let aud: string;
  let iss: string;
  let testEnv: any;
  const sessionId = "valid-session-123";

  beforeAll(async () => {
    secret = (env as any).API_SECRET_KEY || "test_secret";
    aud = "test_aud";
    iss = "test_iss";
    testEnv = { ...env, API_SECRET_KEY: secret, JWT_AUDIENCE: aud, JWT_ISSUER: iss };

    // Setup valid session in D1
    await (env as any).DB.prepare(
      "INSERT INTO refresh_tokens (token_hash, session_id, expires_at, status) VALUES (?, ?, ?, ?)"
    )
      .bind("fake_hash_1", sessionId, Math.floor(Date.now() / 1000) + 86400, "active")
      .run();
      
    // Setup another session that is active but will be blacklisted
    await (env as any).DB.prepare(
      "INSERT INTO refresh_tokens (token_hash, session_id, expires_at, status) VALUES (?, ?, ?, ?)"
    )
      .bind("fake_hash_2", "blacklisted-session", Math.floor(Date.now() / 1000) + 86400, "active")
      .run();
  });

  const getPayload = (overrides = {}) => ({
    sub: "1",
    aud,
    iss,
    exp: Math.floor(Date.now() / 1000) + 3600,
    session_id: sessionId,
    ...overrides
  });

  it("Passes with valid JWT", async () => {
    const token = await sign(getPayload(), secret);
    const res = await app.fetch(
      new Request("http://localhost/protected", {
        headers: { Authorization: `Bearer ${token}` }
      }),
      testEnv
    );
    expect(res.status).toBe(200);
  });

  it("Fails with expired JWT", async () => {
    const payload = getPayload({ exp: Math.floor(Date.now() / 1000) - 3600 });
    const token = await sign(payload, secret);
    const res = await app.fetch(
      new Request("http://localhost/protected", {
        headers: { Authorization: `Bearer ${token}` }
      }),
      testEnv
    );
    expect(res.status).toBe(401);
  });

  it("Fails with invalid audience", async () => {
    const token = await sign(getPayload({ aud: "wrong-aud" }), secret);
    const res = await app.fetch(
      new Request("http://localhost/protected", {
        headers: { Authorization: `Bearer ${token}` }
      }),
      testEnv
    );
    expect(res.status).toBe(401);
  });

  it("Fails with invalid issuer", async () => {
    const token = await sign(getPayload({ iss: "wrong-iss" }), secret);
    const res = await app.fetch(
      new Request("http://localhost/protected", {
        headers: { Authorization: `Bearer ${token}` }
      }),
      testEnv
    );
    expect(res.status).toBe(401);
  });

  it("Fails with blacklisted session in KV SESSION_BLACKLIST", async () => {
    const badSession = "blacklisted-session";
    await testEnv.SESSION_BLACKLIST.put(`session:${badSession}`, "revoked");
    
    const token = await sign(getPayload({ session_id: badSession }), secret);
    const res = await app.fetch(
      new Request("http://localhost/protected", {
        headers: { Authorization: `Bearer ${token}` }
      }),
      testEnv
    );
    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).toContain("Session revoked");
  });

  it("Fails when session missing from D1", async () => {
    const token = await sign(getPayload({ session_id: "nonexistent-session" }), secret);
    const res = await app.fetch(
      new Request("http://localhost/protected", {
        headers: { Authorization: `Bearer ${token}` }
      }),
      testEnv
    );
    expect(res.status).toBe(401);
  });

  it("Fails with missing Authorization header", async () => {
    const res = await app.fetch(
      new Request("http://localhost/protected"),
      testEnv
    );
    expect(res.status).toBe(401);
  });

  it("Fails with malformed Bearer token", async () => {
    const res = await app.fetch(
      new Request("http://localhost/protected", {
        headers: { Authorization: "Bearer invalid.token.here" }
      }),
      testEnv
    );
    expect(res.status).toBe(401);
  });
});
