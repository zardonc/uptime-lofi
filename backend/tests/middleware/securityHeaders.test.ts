import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { securityHeadersMiddleware } from "../../src/middleware/securityHeaders";
import app from "../../src/index";
import { env } from "cloudflare:workers";

describe("Security Headers Middleware", () => {
  it("injects security headers correctly on a dummy route", async () => {
    const testApp = new Hono();
    testApp.use("*", securityHeadersMiddleware);
    testApp.get("/", (c) => c.text("ok"));

    const res = await testApp.fetch(new Request("http://localhost/"));
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Strict-Transport-Security")).toContain("max-age=");
    expect(res.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
    expect(res.headers.get("Permissions-Policy")).toContain("camera=()");
  });

  it("injects security headers into real API routes like /api/auth/status", async () => {
    const res = await app.fetch(new Request("http://localhost/api/auth/status", {
      method: "POST"
    }), env);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.has("Content-Security-Policy")).toBe(true);
  });
});
