import type { MonitorStatus } from "../schemas/v2";
import { dispatchAlertEvent } from "./notificationDispatcher";

export type AlertCondition = "offline" | "latency" | "http_status" | "cpu" | "memory";
type AlertSeverity = "info" | "warning" | "critical";
type AlertState = "ok" | "pending" | "firing" | "suppressed" | "recovered";
type AlertEventType = "pending" | "firing" | "suppressed" | "recovered";

type AlertRuleRow = {
  id: string;
  name: string;
  monitor_id: string;
  condition: AlertCondition;
  params_json: string;
  channel_ids_json: string;
  severity: AlertSeverity;
  confirm_for_sec: number;
  repeat_interval_sec: number;
  silent_hours_json: string | null;
  timezone: string;
};

type AlertStateRow = {
  rule_id: string;
  monitor_id: string;
  state: AlertState;
  incident_key: string | null;
  first_seen_at: number | null;
  last_seen_at: number | null;
  last_notified_at: number | null;
  recovered_at: number | null;
};

type LatestRow = {
  monitor_id: string;
  name: string;
  type: "agent" | "http" | "tcp";
  status: MonitorStatus | null;
  checked_at: number | null;
  latency_ms: number | null;
  cpu_percent: number | null;
  mem_percent: number | null;
  error_text: string | null;
  last_detail_json: string | null;
};

export async function evaluateAlerts(
  db: D1Database,
  monitorId: string,
  nowSeconds: number,
  options: { readonly fetchImpl?: typeof fetch } = {},
): Promise<number> {
  const latest = await getLatest(db, monitorId);
  if (!latest) return 0;

  const { results } = await db.prepare(
    `SELECT id, name, monitor_id, condition, params_json, channel_ids_json, severity, confirm_for_sec,
            repeat_interval_sec, silent_hours_json, timezone
     FROM alert_rules
     WHERE archived_at IS NULL AND enabled = 1 AND monitor_id = ?
     ORDER BY updated_at ASC`,
  ).bind(monitorId).all<AlertRuleRow>();

  let events = 0;
  for (const rule of results) {
    events += await evaluateRule(db, rule, latest, nowSeconds, options);
  }
  return events;
}

async function evaluateRule(
  db: D1Database,
  rule: AlertRuleRow,
  latest: LatestRow,
  nowSeconds: number,
  options: { readonly fetchImpl?: typeof fetch },
): Promise<number> {
  const state = await getState(db, rule.id);
  const active = isConditionActive(rule, latest);
  const incidentKey = `${rule.id}:${rule.monitor_id}:${rule.condition}`;

  if (!active.matched) {
    if (state && ["pending", "firing", "suppressed"].includes(state.state)) {
      await writeEvent(db, rule, latest, "recovered", incidentKey, nowSeconds, "pending", active.message, options);
      await upsertState(db, {
        rule_id: rule.id,
        monitor_id: rule.monitor_id,
        state: "recovered",
        incident_key: incidentKey,
        first_seen_at: state.first_seen_at,
        last_seen_at: nowSeconds,
        last_notified_at: state.last_notified_at,
        recovered_at: nowSeconds,
      }, nowSeconds);
      return 1;
    }

    await upsertState(db, {
      rule_id: rule.id,
      monitor_id: rule.monitor_id,
      state: "ok",
      incident_key: incidentKey,
      first_seen_at: null,
      last_seen_at: nowSeconds,
      last_notified_at: state?.last_notified_at ?? null,
      recovered_at: null,
    }, nowSeconds);
    return 0;
  }

  const firstSeenAt = state?.state === "pending" || state?.state === "firing" || state?.state === "suppressed"
    ? state.first_seen_at ?? nowSeconds
    : nowSeconds;
  const confirmed = nowSeconds - firstSeenAt >= rule.confirm_for_sec;

  if (!confirmed) {
    if (state?.state !== "pending") {
      await writeEvent(db, rule, latest, "pending", incidentKey, nowSeconds, "not_required", active.message, options);
    }
    await upsertState(db, {
      rule_id: rule.id,
      monitor_id: rule.monitor_id,
      state: "pending",
      incident_key: incidentKey,
      first_seen_at: firstSeenAt,
      last_seen_at: nowSeconds,
      last_notified_at: state?.last_notified_at ?? null,
      recovered_at: null,
    }, nowSeconds);
    return state?.state === "pending" ? 0 : 1;
  }

  const repeatDue = !state?.last_notified_at || nowSeconds - state.last_notified_at >= rule.repeat_interval_sec;
  const firstFire = state?.state !== "firing" && state?.state !== "suppressed";
  if (!firstFire && !repeatDue) {
    await upsertState(db, {
      rule_id: rule.id,
      monitor_id: rule.monitor_id,
      state: state?.state ?? "firing",
      incident_key: incidentKey,
      first_seen_at: firstSeenAt,
      last_seen_at: nowSeconds,
      last_notified_at: state?.last_notified_at ?? null,
      recovered_at: null,
    }, nowSeconds);
    return 0;
  }

  const suppressed = isInSilentHours(rule, nowSeconds);
  const eventType: AlertEventType = suppressed ? "suppressed" : "firing";
  await writeEvent(db, rule, latest, eventType, incidentKey, nowSeconds, suppressed ? "suppressed" : "pending", active.message, options);
  await upsertState(db, {
    rule_id: rule.id,
    monitor_id: rule.monitor_id,
    state: suppressed ? "suppressed" : "firing",
    incident_key: incidentKey,
    first_seen_at: firstSeenAt,
    last_seen_at: nowSeconds,
    last_notified_at: nowSeconds,
    recovered_at: null,
  }, nowSeconds);
  return 1;
}

async function getLatest(db: D1Database, monitorId: string): Promise<LatestRow | null> {
  return db.prepare(
    `SELECT m.id AS monitor_id, m.name, m.type, ml.status, ml.checked_at, ml.latency_ms,
            ml.cpu_percent, ml.mem_percent, ml.error_text,
            (
              SELECT cr.detail_json
              FROM check_results cr
              WHERE cr.monitor_id = m.id
              ORDER BY cr.timestamp DESC, cr.id DESC
              LIMIT 1
            ) AS last_detail_json
     FROM monitors m
     LEFT JOIN monitor_latest ml ON ml.monitor_id = m.id
     WHERE m.id = ? AND m.archived_at IS NULL
     LIMIT 1`,
  ).bind(monitorId).first<LatestRow>();
}

async function getState(db: D1Database, ruleId: string): Promise<AlertStateRow | null> {
  return db.prepare(
    `SELECT rule_id, monitor_id, state, incident_key, first_seen_at, last_seen_at, last_notified_at, recovered_at
     FROM alert_rule_state
     WHERE rule_id = ?
     LIMIT 1`,
  ).bind(ruleId).first<AlertStateRow>();
}

function isConditionActive(rule: AlertRuleRow, latest: LatestRow): { matched: boolean; message: string } {
  const params = safeJson(rule.params_json);
  if (rule.condition === "offline") {
    return {
      matched: latest.status === "offline",
      message: latest.status === "offline" ? `${latest.name} is offline` : `${latest.name} recovered from offline`,
    };
  }

  if (rule.condition === "latency") {
    const threshold = numberParam(params, "threshold_ms", 1000);
    return {
      matched: typeof latest.latency_ms === "number" && latest.latency_ms > threshold,
      message: `${latest.name} latency ${latest.latency_ms ?? "unknown"}ms crossed ${threshold}ms`,
    };
  }

  if (rule.condition === "http_status") {
    const expected = numberParam(params, "expected_status", 200);
    const actual = numberParam(safeJson(latest.last_detail_json ?? "{}"), "status_code", expected);
    return {
      matched: actual !== expected,
      message: `${latest.name} returned HTTP ${actual}, expected ${expected}`,
    };
  }

  if (rule.condition === "cpu") {
    const threshold = numberParam(params, "threshold_percent", 90);
    return {
      matched: typeof latest.cpu_percent === "number" && latest.cpu_percent >= threshold,
      message: `${latest.name} CPU ${latest.cpu_percent ?? "unknown"}% crossed ${threshold}%`,
    };
  }

  const threshold = numberParam(params, "threshold_percent", 90);
  return {
    matched: typeof latest.mem_percent === "number" && latest.mem_percent >= threshold,
    message: `${latest.name} memory ${latest.mem_percent ?? "unknown"}% crossed ${threshold}%`,
  };
}

function isInSilentHours(rule: AlertRuleRow, nowSeconds: number): boolean {
  const hours = safeJson(rule.silent_hours_json ?? "{}");
  const start = typeof hours.start === "string" ? parseMinuteOfDay(hours.start) : null;
  const end = typeof hours.end === "string" ? parseMinuteOfDay(hours.end) : null;
  if (start === null || end === null || start === end) return false;

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: rule.timezone || "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(new Date(nowSeconds * 1000));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  const current = hour * 60 + minute;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

function parseMinuteOfDay(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

async function writeEvent(
  db: D1Database,
  rule: AlertRuleRow,
  latest: LatestRow,
  eventType: AlertEventType,
  dedupeKey: string,
  nowSeconds: number,
  notificationStatus: "pending" | "suppressed" | "not_required",
  message: string,
  options: { readonly fetchImpl?: typeof fetch },
) {
  const eventId = `alert_evt_${nowSeconds}_${crypto.randomUUID()}`;
  await db.prepare(
    `INSERT INTO alert_events (
       id, rule_id, monitor_id, event_type, severity, message, dedupe_key,
       notification_status, created_at, detail_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    eventId,
    rule.id,
    rule.monitor_id,
    eventType,
    rule.severity,
    message,
    dedupeKey,
    notificationStatus,
    nowSeconds,
    JSON.stringify({
      monitor_status: latest.status,
      condition: rule.condition,
    }),
  ).run();

  if (notificationStatus === "pending") {
    try {
      await dispatchAlertEvent(db, eventId, options);
    } catch (error) {
      console.error("Alert notification dispatch failed:", error instanceof Error ? error.message : String(error));
    }
  }
}

async function upsertState(db: D1Database, state: AlertStateRow, nowSeconds: number) {
  await db.prepare(
    `INSERT INTO alert_rule_state (
       rule_id, monitor_id, state, incident_key, first_seen_at, last_seen_at,
       last_notified_at, recovered_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(rule_id) DO UPDATE SET
       monitor_id = excluded.monitor_id,
       state = excluded.state,
       incident_key = excluded.incident_key,
       first_seen_at = excluded.first_seen_at,
       last_seen_at = excluded.last_seen_at,
       last_notified_at = excluded.last_notified_at,
       recovered_at = excluded.recovered_at,
       updated_at = excluded.updated_at`,
  ).bind(
    state.rule_id,
    state.monitor_id,
    state.state,
    state.incident_key,
    state.first_seen_at,
    state.last_seen_at,
    state.last_notified_at,
    state.recovered_at,
    nowSeconds,
  ).run();
}

function safeJson(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function numberParam(params: Record<string, unknown>, key: string, fallback: number): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
