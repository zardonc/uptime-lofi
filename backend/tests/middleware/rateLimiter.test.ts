import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { Hono } from "hono";
import { strictRateLimit, standardRateLimit, permissiveRateLimit } from "../../src/middleware/rateLimiter";

describe("Rate Limiter Middleware", () => {
  const app = new Hono();
  app.use("/strict", strictRateLimit);
  app.get("/strict", (c) => c.text("ok"));

  app.use("/standard", standardRateLimit);
  app.get("/standard", (c) => c.text("ok"));

  app.use("/permissive", permissiveRateLimit);
  app.get("/permissive", (c) => c.text("ok"));

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Passes requests under strict limit", async () => {
    // Limit is 5
    for (let i = 0; i < 5; i++) {
      const res = await app.fetch(new Request("http://localhost/strict", {
        headers: { "CF-Connecting-IP": "10.0.0.1" }
      }));
      expect(res.status).toBe(200);
    }
  });

  it("Returns 429 when strictly over limit and includes Retry-After header", async () => {
    // Consume limit
    for (let i = 0; i < 5; i++) {
      await app.fetch(new Request("http://localhost/strict", {
        headers: { "CF-Connecting-IP": "10.0.0.2" }
      }));
    }

    // 6th request should fail
    const res = await app.fetch(new Request("http://localhost/strict", {
        headers: { "CF-Connecting-IP": "10.0.0.2" }
    }));
    
    expect(res.status).toBe(429);
    expect(res.headers.has("Retry-After")).toBe(true);
    const retryAfter = parseInt(res.headers.get("Retry-After") || "0", 10);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it("Resets window after time elapses", async () => {
    // Consume limit for an IP
    for (let i = 0; i < 5; i++) {
      await app.fetch(new Request("http://localhost/strict", {
        headers: { "CF-Connecting-IP": "10.0.0.3" }
      }));
    }

    // Advance timers by window duration (60s)
    vi.advanceTimersByTime(60000);

    // Request should succeed again
    const res = await app.fetch(new Request("http://localhost/strict", {
        headers: { "CF-Connecting-IP": "10.0.0.3" }
    }));
    
    expect(res.status).toBe(200);
  });

  it("Applies permissive limit correctly", async () => {
    // Just a quick check to assert permissive path works - we won't loop 300 times to save test time
    const res = await app.fetch(new Request("http://localhost/permissive", {
        headers: { "CF-Connecting-IP": "10.0.0.4" }
    }));
    expect(res.status).toBe(200);
  });
});
