import { describe, expect, it } from "vitest";
import { isHttpTargetAllowed, isTcpTargetAllowed, runHttpCheck, runTcpCheck } from "../../src/agentless/checks";

describe("Agentless check runners", () => {
  it("returns up with latency when HTTP status matches expected status", async () => {
    const result = await runHttpCheck(
      { url: "https://example.com/health", expected_status: 204, timeout: 5 },
      async () => new Response(null, { status: 204 }),
    );

    expect(result.isUp).toBe(true);
    expect(result.latencyMs).toEqual(expect.any(Number));
    expect(result.errorText).toBeNull();
  });

  it("returns reachable with warning when HTTP responds with an unexpected status", async () => {
    const mismatch = await runHttpCheck(
      { url: "https://example.com/health", expected_status: 200, timeout: 5 },
      async () => new Response(null, { status: 503 }),
    );

    expect(mismatch).toMatchObject({ isUp: true, latencyMs: expect.any(Number) });
    expect(mismatch.errorText).toContain("Expected HTTP 200, got 503");
  });

  it("returns down with clear errors when HTTP fetch rejects", async () => {
    const rejected = await runHttpCheck(
      { url: "https://example.com/health", expected_status: 200, timeout: 5 },
      async () => {
        throw new Error("network failed");
      },
    );

    expect(rejected).toEqual({ isUp: false, latencyMs: null, errorText: "network failed" });
  });

  it("rejects Worker-disallowed TCP targets with clear reason text", () => {
    const cases = [
      ["", 443, "Host is required"],
      ["localhost", 443, "localhost"],
      ["127.0.0.1", 443, "loopback"],
      ["::1", 443, "loopback"],
      ["[::1]", 443, "loopback"],
      ["fc00::1", 443, "private"],
      ["fd12:3456::1", 443, "private"],
      ["fe80::1", 443, "private"],
      ["fe90::1", 443, "private"],
      ["fea0::1", 443, "private"],
      ["febf::1", 443, "private"],
      ["10.1.2.3", 443, "private"],
      ["172.16.0.1", 443, "private"],
      ["192.168.1.1", 443, "private"],
      ["example.com", 0, "Port must be between 1 and 65535"],
      ["example.com", 25, "port 25"],
    ] as const;

    for (const [host, port, reason] of cases) {
      const result = isTcpTargetAllowed(host, port);
      expect(result.allowed, `${host}:${port}`).toBe(false);
      expect(result.reason).toContain(reason);
    }
  });

  it("rejects unsafe HTTP targets with clear reason text", () => {
    expect(isHttpTargetAllowed("https://example.com/health").allowed).toBe(true);
    expect(isHttpTargetAllowed("ftp://example.com").reason).toContain("http or https");
    expect(isHttpTargetAllowed("http://localhost:8787").reason).toContain("localhost or private");
    expect(isHttpTargetAllowed("http://192.168.1.1").reason).toContain("localhost or private");
    expect(isHttpTargetAllowed("http://[::1]:8787").reason).toContain("localhost or private");
    expect(isHttpTargetAllowed("http://[fc00::1]").reason).toContain("localhost or private");
    expect(isHttpTargetAllowed("http://[fe80::1]").reason).toContain("localhost or private");
    expect(isHttpTargetAllowed("http://[fe90::1]").reason).toContain("localhost or private");
    expect(isHttpTargetAllowed("http://[fea0::1]").reason).toContain("localhost or private");
    expect(isHttpTargetAllowed("http://[febf::1]").reason).toContain("localhost or private");
  });

  it("returns reachable latency for TCP success and failed errors for thrown connections", async () => {
    const success = await runTcpCheck(
      { host: "db.example.com", port: 5432, timeout: 5 },
      async () => ({ close: async () => undefined }),
    );
    const failure = await runTcpCheck(
      { host: "db.example.com", port: 5432, timeout: 5 },
      async () => {
        throw new Error("connection refused");
      },
    );

    expect(success.isUp).toBe(true);
    expect(success.latencyMs).toEqual(expect.any(Number));
    expect(success.errorText).toBeNull();
    expect(failure).toEqual({ isUp: false, latencyMs: null, errorText: "connection refused" });
  });

  it("uses the configured TCP timeout", async () => {
    const result = await runTcpCheck(
      { host: "db.example.com", port: 5432, timeout: 1 },
      () => new Promise(() => undefined),
    );

    expect(result).toEqual({ isUp: false, latencyMs: null, errorText: "TCP check timed out after 1s" });
  });
});
