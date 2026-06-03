import { describe, it, expect, beforeAll, vi } from "vitest";
import { env } from "cloudflare:workers";
import worker, { scheduled, shouldRefreshStatistics } from "../../src/index";

describe("Scheduled Tasks (Cron)", () => {
  let testEnv: any;
  const db = (env as any).DB;

  beforeAll(async () => {
    testEnv = { ...env };
    
    await db.prepare("DELETE FROM refresh_tokens").run();
    await db.prepare("DELETE FROM login_attempts").run();
    await db.prepare("DELETE FROM audit_log").run();
    await db.prepare("DELETE FROM monitor_latest").run();
    await db.prepare("DELETE FROM agent_metrics").run();
    await db.prepare("DELETE FROM check_results").run();
    await db.prepare("DELETE FROM monitors").run();

    const now = Math.floor(Date.now() / 1000);

    // Insert active token & expired token
    await db.prepare("INSERT INTO refresh_tokens (token_hash, session_id, status, expires_at) VALUES ('h1', 's1', 'active', ?)").bind(now + 1000).run();
    await db.prepare("INSERT INTO refresh_tokens (token_hash, session_id, status, expires_at) VALUES ('h2', 's2', 'active', ?)").bind(now - 1000).run();

    // Insert recent attempt & old attempt (15 mins = 900s)
    await db.prepare("INSERT INTO login_attempts (ip_address, attempt_count, first_attempt_at, last_attempt_at) VALUES ('1.1.1.1', 1, ?, ?)").bind(now - 100, now - 100).run();
    await db.prepare("INSERT INTO login_attempts (ip_address, attempt_count, first_attempt_at, last_attempt_at) VALUES ('1.1.1.2', 1, ?, ?)").bind(now - 1000, now - 1000).run();

    // Insert recent audit & old audit (90 days = 7776000s)
    await db.prepare("INSERT INTO audit_log (action, ip_hash, created_at) VALUES ('login', 'hash1', ?)").bind(now - 86400).run();
    await db.prepare("INSERT INTO audit_log (action, ip_hash, created_at) VALUES ('login', 'hash2', ?)").bind(now - 8000000).run();

    await db.prepare(
      `INSERT INTO monitors (
         id, backend_id, name, type, target, interval_sec, timeout_sec,
         expected_json, config_json, paused, public_visible, created_at, updated_at
       ) VALUES (?, 'default', ?, 'http', ?, 60, 1, ?, ?, 0, 1, ?, ?)`,
    ).bind(
      "due_v2_http",
      "Due V2 HTTP",
      "http://127.0.0.1/health",
      JSON.stringify({ status_code: 200 }),
      JSON.stringify({ url: "http://127.0.0.1/health", expected_status: 200 }),
      now - 600,
      now - 600,
    ).run();
  });

  it("0. Exposes scheduled handler on the Worker default export", () => {
    expect(worker.scheduled).toBe(scheduled);
    expect(worker.fetch).toEqual(expect.any(Function));
  });

  it("0b. Default export fetch handles HTTP requests", async () => {
    const response = await worker.fetch(new Request("http://localhost/"), testEnv, {} as any);
    expect(response.status).toBe(200);
  });

  it("0c. Limits scheduled statistics refreshes to one cron window per hour", () => {
    expect(shouldRefreshStatistics(0)).toBe(true);
    expect(shouldRefreshStatistics(299)).toBe(true);
    expect(shouldRefreshStatistics(300)).toBe(false);
    expect(shouldRefreshStatistics(3599)).toBe(false);
    expect(shouldRefreshStatistics(3600)).toBe(true);
  });

  it("1. Run scheduled task — deletes expired entries but keeps active ones", async () => {
    // Run cron handler
    const event = { scheduledTime: Date.now(), cron: "*/15 * * * *" } as any;
    const ctx = {
      waitUntil: (p: Promise<any>) => p
    } as any;

    await scheduled(event, testEnv, ctx);

    // Check refresh_tokens
    const tokens = await db.prepare("SELECT * FROM refresh_tokens").all();
    expect(tokens.results.length).toBe(1);
    expect(tokens.results[0].session_id).toBe('s1');

    // Check login_attempts
    const attempts = await db.prepare("SELECT * FROM login_attempts").all();
    expect(attempts.results.length).toBe(1);
    expect(attempts.results[0].ip_address).toBe('1.1.1.1');

    // Check audit_logs
    const logs = await db.prepare("SELECT * FROM audit_log").all();
    expect(logs.results.length).toBe(1);
    expect(logs.results[0].ip_hash).toBe('hash1');

    const v2Result = await db.prepare("SELECT * FROM check_results WHERE monitor_id = ?").bind("due_v2_http").first();
    expect(v2Result).toMatchObject({
      monitor_id: "due_v2_http",
      status: "down",
      latency_ms: null,
    });

    const v2Latest = await db.prepare("SELECT * FROM monitor_latest WHERE monitor_id = ?").bind("due_v2_http").first();
    expect(v2Latest).toMatchObject({
      monitor_id: "due_v2_http",
      status: "offline",
      latency_ms: null,
    });
    expect(v2Latest.error_text).toContain("private network");
  });

  it("records reachable HTTP 403 monitors as online without alert-worthy warning text", async () => {
    const now = Math.floor(Date.now() / 1000);
    await db.prepare(
      `INSERT INTO monitors (
         id, backend_id, name, type, target, interval_sec, timeout_sec,
         expected_json, config_json, paused, public_visible, created_at, updated_at
       ) VALUES (?, 'default', ?, 'http', ?, 60, 1, ?, ?, 0, 1, ?, ?)`,
    ).bind(
      "reachable_403_http",
      "Reachable 403 HTTP",
      "https://example.com/forbidden",
      JSON.stringify({ status_code: 200 }),
      JSON.stringify({ url: "https://example.com/forbidden", expected_status: 200 }),
      now - 600,
      now - 600,
    ).run();

    const count = await import("../../src/services/checkRunner").then(({ runDueMonitorChecks }) => runDueMonitorChecks(
      { DB: db },
      now,
      { fetchImpl: async () => new Response(null, { status: 403 }) },
    ));

    expect(count).toBeGreaterThan(0);
    const result = await db.prepare("SELECT * FROM check_results WHERE monitor_id = ?").bind("reachable_403_http").first() as any;
    expect(result).toMatchObject({
      monitor_id: "reachable_403_http",
      status: "up",
      latency_ms: expect.any(Number),
    });
    expect(JSON.parse(result.detail_json)).toEqual({ error_text: null, status_code: 403 });

    const latest = await db.prepare("SELECT * FROM monitor_latest WHERE monitor_id = ?").bind("reachable_403_http").first();
    expect(latest).toMatchObject({
      monitor_id: "reachable_403_http",
      status: "online",
      error_text: null,
    });
  });

  it("2. Does not fail the cron when cleanup tables are unavailable", async () => {
    const now = Math.floor(Date.now() / 1000);
    const fakeDb = {
      prepare(sql: string) {
        if (sql.includes("refresh_tokens") || sql.includes("login_attempts") || sql.includes("audit_log")) {
          return { run: () => Promise.reject(new Error("missing cleanup table")) };
        }
        return db.prepare(sql);
      },
      batch: db.batch.bind(db),
    };
    const event = { scheduledTime: now * 1000, cron: "*/5 * * * *" } as any;
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(scheduled(event, { ...testEnv, DB: fakeDb }, {} as any)).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Cron cleanup failed"), expect.any(String));
    consoleSpy.mockRestore();
  });
});
