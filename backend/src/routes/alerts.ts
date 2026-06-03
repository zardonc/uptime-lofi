import { Hono } from "hono";
import type { Context } from "hono";
import type { Bindings } from "./api";
import {
  createAlertRuleSchema,
  structuredError,
  updateAlertRuleSchema,
  type AlertCondition,
  type BackendSource,
  type CreateAlertRuleInput,
  type UpdateAlertRuleInput,
} from "../schemas/v2";

const alertsApi = new Hono<{ Bindings: Bindings }>();

type MonitorType = "agent" | "http" | "tcp";
type AlertRuleRow = {
  id: string;
  backend_id: string;
  name: string;
  monitor_id: string;
  condition: AlertCondition;
  params_json: string;
  channel_ids_json: string;
  enabled: number;
  severity: "info" | "warning" | "critical";
  confirm_for_sec: number;
  repeat_interval_sec: number;
  silent_hours_json: string | null;
  timezone: string;
  created_at: number;
  updated_at: number;
};
type AlertEventRow = {
  id: string;
  backend_id: string;
  rule_id: string;
  monitor_id: string;
  monitor_name: string;
  rule_name: string;
  event_type: "pending" | "firing" | "suppressed" | "recovered";
  severity: "info" | "warning" | "critical";
  message: string;
  notification_status: "pending" | "suppressed" | "not_required";
  created_at: number;
};
type AlertSilentHours = { readonly start: string; readonly end: string };
type AlertContext = Context<{ Bindings: Bindings }>;

alertsApi.get("/rules", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, backend_id, name, monitor_id, condition, params_json, channel_ids_json,
            enabled, severity, confirm_for_sec, repeat_interval_sec, silent_hours_json,
            timezone, created_at, updated_at
     FROM alert_rules
     WHERE archived_at IS NULL
     ORDER BY updated_at DESC`,
  ).all<AlertRuleRow>();

  return c.json({ data: results.map((row) => toRule(row, backendSource(c.req.header("x-uptime-lofi-backend-id")))) });
});

alertsApi.post("/rules", async (c) => {
  const parsed = createAlertRuleSchema.safeParse(await readJson(c.req.raw));
  if (!parsed.success) return c.json(structuredError("invalid_alert_rule", "Invalid alert rule payload"), 400);

  const monitor = await getMonitorType(c.env.DB, parsed.data.monitor_id);
  if (!monitor) return c.json(structuredError("monitor_not_found", "Monitor not found"), 404);
  const validation = validateCondition(parsed.data.condition, monitor.type);
  if (validation) return c.json(structuredError("invalid_alert_condition", validation), 400);

  const now = nowSeconds();
  const id = `alert_rule_${crypto.randomUUID()}`;
  await c.env.DB.prepare(
    `INSERT INTO alert_rules (
       id, backend_id, name, monitor_id, condition, params_json, channel_ids_json,
       enabled, severity, confirm_for_sec, repeat_interval_sec, silent_hours_json,
       timezone, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    "default",
    parsed.data.name,
    parsed.data.monitor_id,
    parsed.data.condition,
    JSON.stringify(normalizeParams(parsed.data)),
    JSON.stringify(parsed.data.channel_ids),
    parsed.data.enabled ? 1 : 0,
    parsed.data.severity,
    parsed.data.confirm_for_sec,
    parsed.data.repeat_interval_sec,
    parsed.data.silent_hours ? JSON.stringify(parsed.data.silent_hours) : null,
    parsed.data.timezone,
    now,
    now,
  ).run();

  const row = await getRule(c.env.DB, id);
  return c.json({ data: toRule(row!, backendSource(c.req.header("x-uptime-lofi-backend-id"))) });
});

alertsApi.put("/rules/:id", async (c) => {
  const id = c.req.param("id") ?? "";
  const existing = await getRule(c.env.DB, id);
  if (!existing) return c.json(structuredError("alert_rule_not_found", "Alert rule not found"), 404);

  const parsed = updateAlertRuleSchema.safeParse(await readJson(c.req.raw));
  if (!parsed.success) return c.json(structuredError("invalid_alert_rule_update", "Invalid alert rule update"), 400);

  const next = mergeRule(existing, parsed.data);
  const monitor = await getMonitorType(c.env.DB, next.monitor_id);
  if (!monitor) return c.json(structuredError("monitor_not_found", "Monitor not found"), 404);
  const validation = validateCondition(next.condition, monitor.type);
  if (validation) return c.json(structuredError("invalid_alert_condition", validation), 400);

  const now = nowSeconds();
  await c.env.DB.prepare(
    `UPDATE alert_rules
     SET name = ?, monitor_id = ?, condition = ?, params_json = ?, channel_ids_json = ?,
         enabled = ?, severity = ?, confirm_for_sec = ?, repeat_interval_sec = ?,
         silent_hours_json = ?, timezone = ?, updated_at = ?
     WHERE id = ? AND archived_at IS NULL`,
  ).bind(
    next.name,
    next.monitor_id,
    next.condition,
    JSON.stringify(next.params),
    JSON.stringify(next.channel_ids),
    next.enabled ? 1 : 0,
    next.severity,
    next.confirm_for_sec,
    next.repeat_interval_sec,
    next.silent_hours ? JSON.stringify(next.silent_hours) : null,
    next.timezone,
    now,
    id,
  ).run();

  const row = await getRule(c.env.DB, id);
  return c.json({ data: toRule(row!, backendSource(c.req.header("x-uptime-lofi-backend-id"))) });
});

alertsApi.post("/rules/:id/enable", async (c) => setRuleEnabled(c, true));
alertsApi.post("/rules/:id/disable", async (c) => setRuleEnabled(c, false));

alertsApi.delete("/rules/:id", async (c) => {
  const id = c.req.param("id") ?? "";
  const existing = await getRule(c.env.DB, id);
  if (!existing) return c.json(structuredError("alert_rule_not_found", "Alert rule not found"), 404);

  await c.env.DB.prepare("UPDATE alert_rules SET archived_at = ?, updated_at = ? WHERE id = ?")
    .bind(nowSeconds(), nowSeconds(), id)
    .run();
  return c.json({ data: toRule({ ...existing, enabled: 0 }, backendSource(c.req.header("x-uptime-lofi-backend-id"))) });
});

alertsApi.get("/history", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT e.id, r.backend_id, e.rule_id, e.monitor_id, m.name AS monitor_name,
            r.name AS rule_name, e.event_type, e.severity, e.message,
            e.notification_status, e.created_at
     FROM alert_events e
     JOIN alert_rules r ON r.id = e.rule_id
     JOIN monitors m ON m.id = e.monitor_id
     ORDER BY e.created_at DESC
     LIMIT 100`,
  ).all<AlertEventRow>();

  const source = backendSource(c.req.header("x-uptime-lofi-backend-id"));
  return c.json({ data: results.map((row) => ({ ...row, ...source, backend_id: row.backend_id || source.backend_id })) });
});

async function setRuleEnabled(c: AlertContext, enabled: boolean) {
  const id = c.req.param("id") ?? "";
  const existing = await getRule(c.env.DB, id);
  if (!existing) return c.json(structuredError("alert_rule_not_found", "Alert rule not found"), 404);

  await c.env.DB.prepare("UPDATE alert_rules SET enabled = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL")
    .bind(enabled ? 1 : 0, nowSeconds(), id)
    .run();
  const row = await getRule(c.env.DB, id);
  return c.json({ data: toRule(row!, backendSource(c.req.header("x-uptime-lofi-backend-id"))) });
}

function validateCondition(condition: AlertCondition, monitorType: MonitorType): string | null {
  if (condition === "offline") return null;
  if (condition === "latency") return null;
  if (condition === "http_status") return monitorType === "http" ? null : "HTTP status alerts require an HTTP monitor";
  if (condition === "cpu" || condition === "memory") return monitorType === "agent" ? null : `${condition.toUpperCase()} alerts require an agent monitor`;
  return "Unsupported alert condition";
}

function normalizeParams(input: CreateAlertRuleInput): Record<string, unknown> {
  if (input.condition === "latency") return { threshold_ms: numberParam(input.params, "threshold_ms", 1000) };
  if (input.condition === "http_status") return { expected_status: numberParam(input.params, "expected_status", 200) };
  if (input.condition === "cpu" || input.condition === "memory") return { threshold_percent: numberParam(input.params, "threshold_percent", 90) };
  return {};
}

function mergeRule(row: AlertRuleRow, update: UpdateAlertRuleInput) {
  const current = toRule(row, backendSource());
  const candidate = {
    name: update.name ?? current.name,
    monitor_id: update.monitor_id ?? current.monitor_id ?? "",
    condition: update.condition ?? current.condition,
    params: update.params ?? current.params,
    channel_ids: update.channel_ids ?? current.channel_ids,
    enabled: update.enabled ?? current.enabled,
    severity: update.severity ?? current.severity,
    confirm_for_sec: update.confirm_for_sec ?? current.confirm_for_sec,
    repeat_interval_sec: update.repeat_interval_sec ?? current.repeat_interval_sec,
    silent_hours: update.silent_hours === undefined ? current.silent_hours : update.silent_hours,
    timezone: update.timezone ?? current.timezone,
  };
  return {
    ...candidate,
    params: normalizeParams(candidate),
  };
}

async function getRule(db: D1Database, id: string): Promise<AlertRuleRow | null> {
  return db.prepare(
    `SELECT id, backend_id, name, monitor_id, condition, params_json, channel_ids_json,
            enabled, severity, confirm_for_sec, repeat_interval_sec, silent_hours_json,
            timezone, created_at, updated_at
     FROM alert_rules
     WHERE id = ? AND archived_at IS NULL
     LIMIT 1`,
  ).bind(id).first<AlertRuleRow>();
}

async function getMonitorType(db: D1Database, id: string): Promise<{ type: MonitorType } | null> {
  return db.prepare("SELECT type FROM monitors WHERE id = ? AND archived_at IS NULL LIMIT 1").bind(id).first<{ type: MonitorType }>();
}

function toRule(row: AlertRuleRow, source: BackendSource) {
  return {
    ...source,
    backend_id: row.backend_id || source.backend_id,
    id: row.id,
    name: row.name,
    monitor_id: row.monitor_id,
    condition: row.condition,
    params: safeJson(row.params_json),
    channel_ids: safeJsonArray(row.channel_ids_json),
    enabled: row.enabled === 1,
    severity: row.severity,
    confirm_for_sec: row.confirm_for_sec,
    repeat_interval_sec: row.repeat_interval_sec,
    silent_hours: parseSilentHours(row.silent_hours_json),
    timezone: row.timezone,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function backendSource(backendId?: string): BackendSource {
  return {
    backend_id: backendId || "default",
    backend_label: "Default backend",
    backend_type: "cloudflare_worker",
  };
}

async function readJson(request: Request) {
  return request.json().catch(() => null);
}

function safeJson(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function safeJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseSilentHours(value: string | null): AlertSilentHours | null {
  if (!value) return null;
  const parsed = safeJson(value);
  return typeof parsed.start === "string" && typeof parsed.end === "string"
    ? { start: parsed.start, end: parsed.end }
    : null;
}

function numberParam(params: Record<string, unknown>, key: string, fallback: number): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export { alertsApi };
