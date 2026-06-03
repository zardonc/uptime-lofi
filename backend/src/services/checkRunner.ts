import type { ConnectFunction } from "../agentless/checks";
import { runHttpCheck, runTcpCheck } from "../agentless/checks";
import type { Bindings } from "../routes/api";
import { evaluateAlerts } from "./alertEngine";
import { updateMonitorLatestFromCheckResult } from "./monitorLatest";

const V2_CHECK_LIMIT = 25;

type DueMonitor = {
  readonly id: string;
  readonly type: "http" | "tcp";
  readonly timeout_sec: number;
  readonly config_json: string;
};

type RunDueMonitorOptions = {
  readonly fetchImpl?: typeof fetch;
  readonly connectImpl?: ConnectFunction;
};

type CheckStatus = "up" | "down" | "warn";

export async function runDueMonitorChecks(
  env: Pick<Bindings, "DB">,
  nowSeconds: number,
  options: RunDueMonitorOptions = {},
): Promise<number> {
  const { results } = await env.DB.prepare(
    `SELECT m.id, m.type, m.timeout_sec, m.config_json
     FROM monitors m
     LEFT JOIN monitor_latest ml ON ml.monitor_id = m.id
     WHERE m.archived_at IS NULL
       AND m.paused = 0
       AND m.type IN ('http', 'tcp')
       AND (ml.checked_at IS NULL OR ml.checked_at + m.interval_sec <= ?)
     ORDER BY COALESCE(ml.checked_at, 0) ASC, m.created_at ASC
     LIMIT ?`,
  ).bind(nowSeconds, V2_CHECK_LIMIT).all<DueMonitor>();

  let checked = 0;
  for (const monitor of results) {
    try {
      const result = await runMonitorCheck(monitor, options);
      const status = checkResultStatus(result.isUp, result.errorText);
      await recordCheckResult(env.DB, monitor.id, nowSeconds, status, result.latencyMs, result.errorText, result.statusCode);
      await evaluateAlerts(env.DB, monitor.id, nowSeconds);
      checked += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`V2 monitor check failed for ${monitor.id}:`, message);
      await recordCheckResult(env.DB, monitor.id, nowSeconds, "down", null, `Internal monitor check error: ${message}`);
      await evaluateAlerts(env.DB, monitor.id, nowSeconds);
      checked += 1;
    }
  }

  return checked;
}

async function runMonitorCheck(monitor: DueMonitor, options: RunDueMonitorOptions) {
  const config = safeJson(monitor.config_json);
  if (monitor.type === "http") {
    return runHttpCheck({
      url: String(config.url ?? ""),
      expected_status: Number(config.expected_status ?? 200),
      timeout: monitor.timeout_sec,
    }, options.fetchImpl);
  }

  return runTcpCheck({
    host: String(config.host ?? ""),
    port: Number(config.port),
    timeout: monitor.timeout_sec,
  }, options.connectImpl);
}

async function recordCheckResult(
  db: D1Database,
  monitorId: string,
  timestamp: number,
  status: CheckStatus,
  latencyMs: number | null,
  errorText: string | null,
  statusCode?: number,
) {
  await db.prepare(
    `INSERT INTO check_results (monitor_id, timestamp, status, latency_ms, detail_json)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(
    monitorId,
    timestamp,
    status,
    latencyMs,
    JSON.stringify({
      error_text: errorText,
      ...(typeof statusCode === "number" ? { status_code: statusCode } : {}),
    }),
  ).run();

  await updateMonitorLatestFromCheckResult(db, {
    monitorId,
    timestamp,
    status,
    latencyMs,
    errorText,
  });
}

function checkResultStatus(isUp: boolean, errorText: string | null): CheckStatus {
  if (!isUp) return "down";
  return errorText ? "warn" : "up";
}

function safeJson(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}
