import type { MonitorStatus } from "../schemas/v2";

type CheckStatus = "up" | "down" | "warn";

export type MonitorLatestSnapshot = {
  readonly monitor_id: string;
  readonly status: MonitorStatus;
  readonly checked_at: number | null;
  readonly latency_ms: number | null;
  readonly uptime_ratio: number | null;
  readonly cpu_percent: number | null;
  readonly mem_percent: number | null;
  readonly error_text: string | null;
  readonly updated_at: number | null;
};

export type PublicMonitorLatest = Pick<
  MonitorLatestSnapshot,
  "status" | "checked_at" | "latency_ms" | "uptime_ratio" | "updated_at"
>;

type LatestRow = {
  monitor_id: string;
  status: Exclude<MonitorStatus, "paused">;
  checked_at: number | null;
  latency_ms: number | null;
  uptime_ratio: number | null;
  cpu_percent: number | null;
  mem_percent: number | null;
  error_text: string | null;
  updated_at: number;
  paused: number;
};

export async function updateMonitorLatestFromCheckResult(
  db: D1Database,
  result: {
    readonly monitorId: string;
    readonly timestamp: number;
    readonly status: CheckStatus;
    readonly latencyMs: number | null;
    readonly errorText: string | null;
  },
): Promise<void> {
  await upsertMonitorLatest(db, {
    monitorId: result.monitorId,
    status: checkStatusToLatest(result.status),
    checkedAt: result.timestamp,
    latencyMs: result.latencyMs,
    uptimeRatio: await calculateRecentUptime(db, result.monitorId),
    cpuPercent: null,
    memPercent: null,
    errorText: result.errorText,
    updatedAt: result.timestamp,
  });
}

export async function updateMonitorLatestFromAgentMetric(
  db: D1Database,
  metric: {
    readonly monitorId: string;
    readonly timestamp: number;
    readonly isUp: boolean;
    readonly latencyMs: number | null;
    readonly cpuPercent: number | null;
    readonly memPercent: number | null;
    readonly payloadJson: string | null;
  },
): Promise<void> {
  await db.prepare(
    `INSERT INTO agent_metrics (monitor_id, timestamp, cpu_percent, mem_percent, payload_json)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(metric.monitorId, metric.timestamp, metric.cpuPercent, metric.memPercent, metric.payloadJson).run();

  await upsertMonitorLatest(db, {
    monitorId: metric.monitorId,
    status: agentMetricStatus(metric.isUp, metric.cpuPercent, metric.memPercent),
    checkedAt: metric.timestamp,
    latencyMs: metric.latencyMs,
    uptimeRatio: null,
    cpuPercent: metric.cpuPercent,
    memPercent: metric.memPercent,
    errorText: metric.isUp ? null : "Probe reported host offline",
    updatedAt: metric.timestamp,
  });
}

export async function getMonitorLatestSnapshot(db: D1Database, monitorId: string): Promise<MonitorLatestSnapshot | null> {
  const row = await db.prepare(
    `SELECT
       m.id AS monitor_id, m.paused, ml.status, ml.checked_at, ml.latency_ms,
       ml.uptime_ratio, ml.cpu_percent, ml.mem_percent, ml.error_text, ml.updated_at
     FROM monitors m
     LEFT JOIN monitor_latest ml ON ml.monitor_id = m.id
     WHERE m.id = ? AND m.archived_at IS NULL
     LIMIT 1`,
  ).bind(monitorId).first<LatestRow>();

  if (!row) return null;
  return {
    monitor_id: row.monitor_id,
    status: row.paused ? "paused" : row.status ?? "unknown",
    checked_at: row.checked_at,
    latency_ms: row.latency_ms,
    uptime_ratio: row.uptime_ratio,
    cpu_percent: row.cpu_percent,
    mem_percent: row.mem_percent,
    error_text: row.error_text,
    updated_at: row.updated_at,
  };
}

export function toPublicMonitorLatest(snapshot: MonitorLatestSnapshot): PublicMonitorLatest {
  return {
    status: snapshot.status,
    checked_at: snapshot.checked_at,
    latency_ms: snapshot.latency_ms,
    uptime_ratio: snapshot.uptime_ratio,
    updated_at: snapshot.updated_at,
  };
}

async function upsertMonitorLatest(
  db: D1Database,
  latest: {
    readonly monitorId: string;
    readonly status: Exclude<MonitorStatus, "paused">;
    readonly checkedAt: number;
    readonly latencyMs: number | null;
    readonly uptimeRatio: number | null;
    readonly cpuPercent: number | null;
    readonly memPercent: number | null;
    readonly errorText: string | null;
    readonly updatedAt: number;
  },
) {
  await db.prepare(
    `INSERT INTO monitor_latest (
       monitor_id, status, checked_at, latency_ms, uptime_ratio,
       cpu_percent, mem_percent, error_text, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(monitor_id) DO UPDATE SET
       status = excluded.status,
       checked_at = excluded.checked_at,
       latency_ms = excluded.latency_ms,
       uptime_ratio = COALESCE(excluded.uptime_ratio, monitor_latest.uptime_ratio),
       cpu_percent = excluded.cpu_percent,
       mem_percent = excluded.mem_percent,
       error_text = excluded.error_text,
       updated_at = excluded.updated_at`,
  ).bind(
    latest.monitorId,
    latest.status,
    latest.checkedAt,
    latest.latencyMs,
    latest.uptimeRatio,
    latest.cpuPercent,
    latest.memPercent,
    latest.errorText,
    latest.updatedAt,
  ).run();
}

async function calculateRecentUptime(db: D1Database, monitorId: string): Promise<number | null> {
  const row = await db.prepare(
    `SELECT AVG(CASE WHEN status = 'up' THEN 1.0 ELSE 0.0 END) * 100 AS uptime_ratio
     FROM (
       SELECT status
       FROM check_results
       WHERE monitor_id = ?
       ORDER BY timestamp DESC, id DESC
       LIMIT 100
     )`,
  ).bind(monitorId).first<{ uptime_ratio: number | null }>();
  return row?.uptime_ratio ?? null;
}

function checkStatusToLatest(status: CheckStatus): Exclude<MonitorStatus, "paused"> {
  if (status === "up") return "online";
  if (status === "warn") return "degraded";
  return "offline";
}

function agentMetricStatus(
  isUp: boolean,
  cpuPercent: number | null,
  memPercent: number | null,
): Exclude<MonitorStatus, "paused"> {
  if (!isUp) return "offline";
  if ((cpuPercent ?? 0) >= 90 || (memPercent ?? 0) >= 90) return "degraded";
  return "online";
}
