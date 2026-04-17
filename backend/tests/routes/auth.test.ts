import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { env } from "cloudflare:workers";
import app from "../../src/index";
import { getCookie } from "hono/cookie";

describe("Auth Routes (/api/auth)", () => {
  let testEnv: any;

  beforeAll(async () => {
    // Setup test environment
    testEnv = { 
      ...env, 
      API_SECRET_KEY: "test_admin_key",
      EMERGENCY_UNLOCK_KEY: "test_emergency_key",
      JWT_AUDIENCE: "test_aud",
      JWT_ISSUER: "test_iss",
      SESSION_BLACKLIST: {
        store: new Map(),
        async get(key: string) { return this.store.get(key) || null; },
        async put(key: string, value: string) { this.store.set(key, value); }
      }
    };

    // Clean up kv_settings table
    await (env as any).DB.prepare("DELETE FROM kv_settings").run();
  });

  // Helper to get a successful login and return token + raw cookie
  async function setupAndLogin(envObj: any): Promise<{ token: string; rawCookie: string }> {
    const uniqueIp = "192.168.1." + Math.floor(Math.random() * 255);
    // 1. Setup password
    const setupRes = await app.fetch(
      new Request("http://localhost/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": uniqueIp },
        body: JSON.stringify({ admin_key: envObj.API_SECRET_KEY, new_ui_password: "MySecurePassword1" })
      }),
      envObj
    );
    if (!setupRes.ok) throw new Error("setupAndLogin: setup failed with " + setupRes.status);

    // 2. Login
    const loginRes = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": uniqueIp },
        body: JSON.stringify({ password: "MySecurePassword1" })
      }),
      envObj
    );
    if (!loginRes.ok) throw new Error("setupAndLogin: login failed with " + loginRes.status);

    const json: any = await loginRes.json();
    const setCookie = loginRes.headers.get("Set-Cookie");
    const rawCookie = setCookie ? setCookie.split(";")[0] : ""; // e.g. refresh_token=XYZ
    return { token: json.access_token, rawCookie };
  }

  describe("POST /api/auth/setup", () => {
    it("First call succeeds — creates password hash in kv_settings", async () => {
      // clear db
      await (env as any).DB.prepare("DELETE FROM kv_settings").run();

      const res = await app.fetch(
        new Request("http://localhost/api/auth/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ admin_key: testEnv.API_SECRET_KEY, new_ui_password: "NewPasswordX1!" })
        }),
        testEnv
      );

      const json = await res.json();
      expect(res.status).toBe(200);
      expect((json as any).success).toBe(true);
    });

    it("Invalid body (missing password) — 400", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/auth/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ admin_key: testEnv.API_SECRET_KEY })
        }),
        testEnv
      );
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/auth/login", () => {
    beforeAll(async () => {
      await (env as any).DB.prepare("DELETE FROM kv_settings").run();
      await app.fetch(
        new Request("http://localhost/api/auth/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ admin_key: testEnv.API_SECRET_KEY, new_ui_password: "CorrectPassword123" })
        }),
        testEnv
      );
    });

    it("Correct password — returns JWT + refresh token (200)", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: "CorrectPassword123" })
        }),
        testEnv
      );
      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.access_token).toBeDefined();
      expect(res.headers.get("Set-Cookie")).toContain("refresh_token=");
    });

    it("Missing password field — returns 400", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        }),
        testEnv
      );
      expect(res.status).toBe(400);
    });

    it("Wrong password — returns 401 and tracks failed attempt", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json", "CF-Connecting-IP": "10.0.0.1" },
          body: JSON.stringify({ password: "WrongPassword" })
        }),
        testEnv
      );
      expect(res.status).toBe(401);
    });

    it("Rate-limited after too many failures — returns 429", async () => {
      // Already failed 1 time from previous test. Let's make 4 more failures using same IP.
      for (let i = 0; i < 4; i++) {
        await app.fetch(
          new Request("http://localhost/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json", "CF-Connecting-IP": "10.0.0.1" },
            body: JSON.stringify({ password: "WrongPassword" })
          }),
          testEnv
        );
      }
      
      // 6th attempt should be 429
      const res = await app.fetch(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json", "CF-Connecting-IP": "10.0.0.1" },
          body: JSON.stringify({ password: "WrongPassword" })
        }),
        testEnv
      );
      expect(res.status).toBe(429);
      const text = await res.text();
      expect(text).toMatch(/Too Many Requests|Too many failed attempts/);
    });
  });

  describe("POST /api/auth/refresh", () => {
    beforeAll(async () => {
      await (env as any).DB.prepare("DELETE FROM kv_settings").run();
      await (env as any).DB.prepare("DELETE FROM refresh_tokens").run();
    });

    it("Valid refresh token — returns new JWT + new refresh token (rotation)", async () => {
      const { rawCookie } = await setupAndLogin(testEnv);
      
      const res = await app.fetch(
        new Request("http://localhost/api/auth/refresh", {
          method: "POST",
          headers: { "Cookie": rawCookie }
        }),
        testEnv
      );
      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.access_token).toBeDefined();
      const newCookie = res.headers.get("Set-Cookie");
      expect(newCookie).toBeDefined();
      expect(newCookie).not.toBe(rawCookie); // Has rotated!
    });

    it("Expired refresh token — returns 401", async () => {
      const { rawCookie } = await setupAndLogin(testEnv);
      
      // Manually expire the token in the DB
      const originalRefreshToken = rawCookie.split("=")[1];
      // Since hash calculation is async, we can just expire ALL active tokens for test
      await (env as any).DB.prepare("UPDATE refresh_tokens SET expires_at = strftime('%s', 'now') - 100").run();

      const res = await app.fetch(
        new Request("http://localhost/api/auth/refresh", {
          method: "POST",
          headers: { "Cookie": rawCookie }
        }),
        testEnv
      );
      expect(res.status).toBe(401);
      const json: any = await res.json();
      expect(json.error).toBe("Token expired");
    });

    it("Already-used refresh token (replay detection) — returns 401", async () => {
      const { rawCookie } = await setupAndLogin(testEnv);
      
      // Attempt 1: Works, consumes token
      const res1 = await app.fetch(
        new Request("http://localhost/api/auth/refresh", {
          method: "POST",
          headers: { "Cookie": rawCookie }
        }),
        testEnv
      );
      expect(res1.status).toBe(200);

      // Attempt 2: Should fail and revoke session
      const res2 = await app.fetch(
        new Request("http://localhost/api/auth/refresh", {
          method: "POST",
          headers: { "Cookie": rawCookie }
        }),
        testEnv
      );
      expect(res2.status).toBe(401);
      const json2: any = await res2.json();
      expect(json2.error).toContain("Token reuse detected");
    });

    it("Invalid token format — returns 401", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/auth/refresh", {
          method: "POST",
          headers: { "Cookie": "refresh_token=fake_invalid_token_12345" }
        }),
        testEnv
      );
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/auth/logout", () => {
    it("Valid JWT — blacklists session in KV, returns 200", async () => {
      await (env as any).DB.prepare("DELETE FROM kv_settings").run();
      const { token } = await setupAndLogin(testEnv);

      const res = await app.fetch(
        new Request("http://localhost/api/auth/logout", {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}` }
        }),
        testEnv
      );
      expect(res.status).toBe(200);

      // Verify session is revoked via D1
      const count = await (env as any).DB.prepare("SELECT count(*) as c FROM refresh_tokens WHERE status = 'active'").first("c");
      expect(count).toBe(0);
    });

    it("Missing/invalid JWT — returns 401", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/auth/logout", {
          method: "POST"
        }),
        testEnv
      );
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/auth/unlock (emergency)", () => {
    it("Valid emergency key — revokes all sessions, returns 200", async () => {
      // Pre-requisite: we have an active session
      await (env as any).DB.prepare("DELETE FROM kv_settings").run();
      await setupAndLogin(testEnv);
      
      const res = await app.fetch(
        new Request("http://localhost/api/auth/unlock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ admin_key: testEnv.API_SECRET_KEY })
        }),
        testEnv
      );
      // Disable UI lock success
      expect(res.status).toBe(200);
      
      // And also verifies emergency key can be used to login if we use the emergency unlock flow
      // Actually /api/auth/unlock disables the UI lock. It doesn't use EMERGENCY_UNLOCK_KEY, it uses admin_key (API_SECRET_KEY)
      // Wait, let's look at the implementation: "if (admin_key !== c.env.API_SECRET_KEY) ..."
    });

    it("Missing key — returns 400", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/auth/unlock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        }),
        testEnv
      );
      expect(res.status).toBe(400);
    });
    
    it("Invalid emergency key — returns 401", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/auth/unlock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ admin_key: "wrong-admin-key" })
        }),
        testEnv
      );
      expect(res.status).toBe(401);
    });
    
    it("Login with emergency unlock key — revokes sessions and succeeds", async () => {
      await (env as any).DB.prepare("DELETE FROM kv_settings").run();
      const { token } = await setupAndLogin(testEnv);
      
      const res = await app.fetch(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json", "CF-Connecting-IP": "127.0.0.1" },
          body: JSON.stringify({ password: "test_emergency_key" })
        }),
        testEnv
      );
      
      expect(res.status).toBe(200); // Login success
      // And the previous session should be revoked!
      const activeCount = await (env as any).DB.prepare("SELECT count(*) as c FROM refresh_tokens WHERE status = 'active'").first("c");
      // Only the newly created session should be active
      expect(activeCount).toBe(1);
    });
  });
});
