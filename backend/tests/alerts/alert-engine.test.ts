import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { evaluateAlerts } from "../../src/services/alertEngine";

describe("alertEngine", () => {
  const db = (env as any).DB;

  beforeEach(async () => {
    await db.prepare("DELETE FROM alert_events").run();
    await db.prepare("DELETE FROM alert_rule_state").run();
    await db.prepare("DELETE FROM alert_rules").run();
    await db.prepare("DELETE FROM monitor_latest").run();
    await db.prepare("DELETE FROM agent_metrics").run();
    await db.prepare("DELETE FROM check_results").run();
    await db.prepare("DELETE FROM monitors").run();
  });

  it("waits for confirmation delay before firing", async () => {
    await insertMonitor("http-1", "Homepage", "http");
    await insertLatest("http-1", "offline", { checked_at: 100, latency_ms: null });
    await insertRule("rule-1", "http-1", "offline", {}, { confirm_for_sec: 60 });

    expect(await evaluateAlerts(db, "http-1", 100)).toBe(1);
    expect(await eventTypes()).toEqual(["pending"]);

    expect(await evaluateAlerts(db, "http-1", 130)).toBe(0);
    expect(await eventTypes()).toEqual(["pending"]);

    expect(await evaluateAlerts(db, "http-1", 161)).toBe(1);
    expect(await eventTypes()).toEqual(["pending", "firing"]);
  });

  it("dedupes repeated evaluations during the same incident", async () => {
    await insertMonitor("http-1", "Homepage", "http");
    await insertLatest("http-1", "offline", { checked_at: 100, latency_ms: null });
    await insertRule("rule-1", "http-1", "offline", {}, { repeat_interval_sec: 3600 });

    expect(await evaluateAlerts(db, "http-1", 100)).toBe(1);
    expect(await evaluateAlerts(db, "http-1", 120)).toBe(0);

    const events = await eventTypes();
    expect(events).toEqual(["firing"]);
  });

  it("writes a recovered event after the condition clears", async () => {
    await insertMonitor("http-1", "Homepage", "http");
    await insertLatest("http-1", "offline", { checked_at: 100, latency_ms: null });
    await insertRule("rule-1", "http-1", "offline", {});

    await evaluateAlerts(db, "http-1", 100);
    await insertLatest("http-1", "online", { checked_at: 140, latency_ms: 42 });
    await evaluateAlerts(db, "http-1", 140);

    expect(await eventTypes()).toEqual(["firing", "recovered"]);
  });

  it("does not fire HTTP status alerts for reachable HTTP 403 checks", async () => {
    await insertMonitor("http-1", "Homepage", "http");
    await insertLatest("http-1", "online", { checked_at: 100, latency_ms: 42 });
    await db.prepare(
      "INSERT INTO check_results (monitor_id, timestamp, status, latency_ms, detail_json) VALUES (?, ?, 'up', ?, ?)",
    ).bind("http-1", 100, 42, JSON.stringify({ status_code: 403, error_text: null })).run();
    await insertRule("rule-1", "http-1", "http_status", { expected_status: 200 });

    expect(await evaluateAlerts(db, "http-1", 100)).toBe(0);
    expect(await eventTypes()).toEqual([]);
  });

  it("suppresses notification intents during silent hours", async () => {
    await insertMonitor("agent-1", "Agent", "agent");
    await insertLatest("agent-1", "online", { checked_at: 100, cpu_percent: 95 });
    await insertRule("rule-1", "agent-1", "cpu", { threshold_percent: 90 }, {
      silent_hours_json: JSON.stringify({ start: "00:00", end: "23:59" }),
      timezone: "UTC",
    });

    await evaluateAlerts(db, "agent-1", 100);
    const row = await db.prepare("SELECT event_type, notification_status FROM alert_events").first() as {
      event_type: string;
      notification_status: string;
    };

    expect(row).toMatchObject({
      event_type: "suppressed",
      notification_status: "suppressed",
    });
  });

  async function insertMonitor(id: string, name: string, type: "agent" | "http" | "tcp") {
    await db.prepare(
      `INSERT INTO monitors (
         id, backend_id, name, type, target, interval_sec, timeout_sec,
         expected_json, config_json, paused, public_visible, created_at, updated_at
       ) VALUES (?, 'default', ?, ?, ?, 60, 10, NULL, '{}', 0, 1, 1, 1)`,
    ).bind(id, name, type, name).run();
  }

  async function insertLatest(
    monitorId: string,
    status: "online" | "degraded" | "offline" | "unknown",
    values: { checked_at: number; latency_ms?: number | null; cpu_percent?: number | null; mem_percent?: number | null },
  ) {
    await db.prepare(
      `INSERT INTO monitor_latest (
         monitor_id, status, checked_at, latency_ms, uptime_ratio,
         cpu_percent, mem_percent, error_text, updated_at
       ) VALUES (?, ?, ?, ?, NULL, ?, ?, NULL, ?)
       ON CONFLICT(monitor_id) DO UPDATE SET
         status = excluded.status,
         checked_at = excluded.checked_at,
         latency_ms = excluded.latency_ms,
         cpu_percent = excluded.cpu_percent,
         mem_percent = excluded.mem_percent,
         updated_at = excluded.updated_at`,
    ).bind(
      monitorId,
      status,
      values.checked_at,
      values.latency_ms ?? null,
      values.cpu_percent ?? null,
      values.mem_percent ?? null,
      values.checked_at,
    ).run();
  }

  async function insertRule(
    id: string,
    monitorId: string,
    condition: "offline" | "latency" | "http_status" | "cpu" | "memory",
    params: Record<string, unknown>,
    overrides: Partial<{ confirm_for_sec: number; repeat_interval_sec: number; silent_hours_json: string | null; timezone: string }> = {},
  ) {
    await db.prepare(
      `INSERT INTO alert_rules (
         id, backend_id, name, monitor_id, condition, params_json, channel_ids_json,
         enabled, severity, confirm_for_sec, repeat_interval_sec, silent_hours_json,
         timezone, created_at, updated_at
       ) VALUES (?, 'default', 'Rule', ?, ?, ?, '[]', 1, 'critical', ?, ?, ?, ?, 1, 1)`,
    ).bind(
      id,
      monitorId,
      condition,
      JSON.stringify(params),
      overrides.confirm_for_sec ?? 0,
      overrides.repeat_interval_sec ?? 3600,
      overrides.silent_hours_json ?? null,
      overrides.timezone ?? "UTC",
    ).run();
  }

  async function eventTypes(): Promise<string[]> {
    const { results } = await db.prepare("SELECT event_type FROM alert_events ORDER BY created_at ASC").all() as {
      results: Array<{ event_type: string }>;
    };
    return results.map((row: { event_type: string }) => row.event_type);
  }
});
