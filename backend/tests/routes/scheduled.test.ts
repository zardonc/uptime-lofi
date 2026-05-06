import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:workers";
import { scheduled } from "../../src/index";

describe("Scheduled Tasks (Cron)", () => {
  let testEnv: any;
  const db = (env as any).DB;

  beforeAll(async () => {
    testEnv = { ...env };
    
    await db.prepare("DELETE FROM refresh_tokens").run();
    await db.prepare("DELETE FROM login_attempts").run();
    await db.prepare("DELETE FROM audit_log").run();
    await db.prepare("DELETE FROM raw_metrics").run();
    await db.prepare("DELETE FROM nodes").run();

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
      "INSERT INTO nodes (id, name, type, status, config_json, last_heartbeat) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(
      "due_agentless_http",
      "Due Agentless HTTP",
      "agentless_http",
      "offline",
      JSON.stringify({ url: "https://example.invalid/health", interval: 300, timeout: 1, expected_status: 200 }),
      now - 600,
    ).run();
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

    const metrics = await db.prepare("SELECT * FROM raw_metrics WHERE node_id = ?").bind("due_agentless_http").all();
    expect(metrics.results.length).toBe(1);
    expect(metrics.results[0].is_up).toBe(0);
    expect(metrics.results[0].error_text).toEqual(expect.any(String));

    const node = await db.prepare("SELECT status, last_heartbeat FROM nodes WHERE id = ?").bind("due_agentless_http").first();
    expect(node.status).toBe("offline");
    expect(node.last_heartbeat).toEqual(expect.any(Number));
  });
});
