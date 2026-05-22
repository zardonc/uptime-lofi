import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import {
  getMonitorLatestSnapshot,
  toPublicMonitorLatest,
  updateMonitorLatestFromAgentMetric,
  updateMonitorLatestFromCheckResult,
} from "../../src/services/monitorLatest";

describe("monitor_latest service", () => {
  const db = (env as any).DB;
  const now = 1_710_000_000;

  beforeEach(async () => {
    await db.prepare("DELETE FROM monitor_latest").run();
    await db.prepare("DELETE FROM agent_metrics").run();
    await db.prepare("DELETE FROM check_results").run();
    await db.prepare("DELETE FROM monitors").run();

    await insertMonitor("http-up", "Homepage", "http", 0, {
      url: "https://example.com/health",
      expected_status: 200,
    });
    await insertMonitor("agent-1", "Edge Agent", "agent", 0, { platform: "linux/amd64" });
    await insertMonitor("paused-http", "Paused HTTP", "http", 1, {
      url: "https://example.com",
      expected_status: 200,
    });
    await insertMonitor("empty-tcp", "Empty TCP", "tcp", 0, { host: "db.example.com", port: 5432 });
  });

  it("upserts online, degraded, and offline states from check results", async () => {
    await updateMonitorLatestFromCheckResult(db, {
      monitorId: "http-up",
      timestamp: now,
      status: "up",
      latencyMs: 42,
      errorText: null,
    });

    let row = await db.prepare("SELECT * FROM monitor_latest WHERE monitor_id = ?").bind("http-up").first();
    expect(row).toMatchObject({ status: "online", checked_at: now, latency_ms: 42, error_text: null });

    await updateMonitorLatestFromCheckResult(db, {
      monitorId: "http-up",
      timestamp: now + 30,
      status: "warn",
      latencyMs: 75,
      errorText: "Expected HTTP 200, got 503",
    });

    row = await db.prepare("SELECT * FROM monitor_latest WHERE monitor_id = ?").bind("http-up").first();
    expect(row).toMatchObject({ status: "degraded", checked_at: now + 30, latency_ms: 75 });

    await updateMonitorLatestFromCheckResult(db, {
      monitorId: "http-up",
      timestamp: now + 60,
      status: "down",
      latencyMs: null,
      errorText: "HTTP checks cannot target localhost or private network addresses",
    });

    row = await db.prepare("SELECT * FROM monitor_latest WHERE monitor_id = ?").bind("http-up").first();
    expect(row).toMatchObject({ status: "offline", checked_at: now + 60, latency_ms: null });
  });

  it("reports paused and no-data states without storing paused in monitor_latest", async () => {
    await updateMonitorLatestFromCheckResult(db, {
      monitorId: "paused-http",
      timestamp: now,
      status: "up",
      latencyMs: 12,
      errorText: null,
    });

    await expect(getMonitorLatestSnapshot(db, "paused-http")).resolves.toMatchObject({
      monitor_id: "paused-http",
      status: "paused",
      checked_at: now,
    });
    await expect(getMonitorLatestSnapshot(db, "empty-tcp")).resolves.toMatchObject({
      monitor_id: "empty-tcp",
      status: "unknown",
      checked_at: null,
    });
  });

  it("updates agent metrics and exposes a public-safe latest summary", async () => {
    await updateMonitorLatestFromAgentMetric(db, {
      monitorId: "agent-1",
      timestamp: now,
      isUp: true,
      latencyMs: 15,
      cpuPercent: 91,
      memPercent: 56,
      payloadJson: JSON.stringify({
        containers_json: "[{\"name\":\"private-db\",\"image\":\"secret/internal\"}]",
        psk: "do-not-leak",
      }),
    });

    const metric = await db.prepare("SELECT * FROM agent_metrics WHERE monitor_id = ?").bind("agent-1").first();
    expect(metric).toMatchObject({ monitor_id: "agent-1", timestamp: now, cpu_percent: 91, mem_percent: 56 });

    const snapshot = await getMonitorLatestSnapshot(db, "agent-1");
    expect(snapshot).not.toBeNull();
    if (!snapshot) throw new Error("expected latest snapshot");
    expect(snapshot).toMatchObject({
      status: "degraded",
      latency_ms: 15,
      cpu_percent: 91,
      mem_percent: 56,
      checked_at: now,
    });

    expect(toPublicMonitorLatest(snapshot)).toEqual({
      status: "degraded",
      checked_at: now,
      latency_ms: 15,
      uptime_ratio: null,
      updated_at: now,
    });
  });

  async function insertMonitor(
    id: string,
    name: string,
    type: "agent" | "http" | "tcp",
    paused: number,
    config: Record<string, unknown>,
  ) {
    await db.prepare(
      `INSERT INTO monitors (
         id, backend_id, name, type, target, interval_sec, timeout_sec,
         expected_json, config_json, paused, public_visible, created_at, updated_at
       ) VALUES (?, 'default', ?, ?, ?, 60, 10, NULL, ?, ?, 1, ?, ?)`,
    ).bind(id, name, type, targetFor(type, config), JSON.stringify(config), paused, now, now).run();
  }

  function targetFor(type: "agent" | "http" | "tcp", config: Record<string, unknown>) {
    if (type === "agent") return "Agent probe";
    if (type === "http") return String(config.url);
    return `${config.host}:${config.port}`;
  }
});
