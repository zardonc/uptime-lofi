import { describe, it, expect } from "vitest";
import { env } from "cloudflare:workers";
import app from "../../src/index";

describe("Health endpoints", () => {
  it("GET /health returns healthy status with DB latency", async () => {
    const response = await app.fetch(
      new Request("http://localhost/health"),
      env
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { status: string; database: { status: string; latency_ms: number } };
    expect(body.status).toBe("healthy");
    expect(body.database.status).toBe("healthy");
    expect(body.database.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it("GET /ready returns ready true", async () => {
    const response = await app.fetch(
      new Request("http://localhost/ready"),
      env
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { ready: boolean };
    expect(body.ready).toBe(true);
  });

  it("GET / returns service status", async () => {
    const response = await app.fetch(
      new Request("http://localhost/"),
      env
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { status: string; service: string };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("uptime-lofi-gateway");
  });
});
