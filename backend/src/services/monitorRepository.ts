import {
  agentMonitorConfigSchema,
  httpMonitorConfigSchema,
  monitorSchema,
  tcpMonitorConfigSchema,
  type BackendSource,
  type CreateMonitorInput,
  type Monitor,
  type MonitorStatus,
  type MonitorType,
  type UpdateMonitorInput,
} from "../schemas/v2";
import { decompress } from "../utils/compression";

type MonitorRow = {
  id: string;
  backend_id: string;
  name: string;
  type: MonitorType;
  target: string | null;
  interval_sec: number;
  timeout_sec: number;
  expected_json: string | null;
  config_json: string;
  paused: number;
  public_visible: number;
  created_at: number;
  updated_at: number;
  latest_status: Exclude<MonitorStatus, "paused"> | null;
  checked_at: number | null;
  latency_ms: number | null;
  uptime_ratio: number | null;
  cpu_percent: number | null;
  mem_percent: number | null;
  error_text: string | null;
  last_detail_json: string | null;
  last_agent_payload_json: string | null;
};

type NormalizedConfig = {
  readonly config: Record<string, unknown>;
  readonly target: string;
  readonly expected: Record<string, unknown> | null;
};

export class MonitorValidationError extends Error {
  constructor(message = "Invalid monitor payload") {
    super(message);
    this.name = "MonitorValidationError";
  }
}

const DEFAULT_SOURCE: BackendSource = {
  backend_id: "default",
  backend_label: "Default backend",
  backend_type: "cloudflare_worker",
};

export async function listMonitors(db: D1Database, source: BackendSource = DEFAULT_SOURCE): Promise<Monitor[]> {
  const { results } = await db.prepare(
    `${selectMonitorSql()}
     WHERE m.archived_at IS NULL
     ORDER BY m.created_at DESC`,
  ).all<MonitorRow>();

  return Promise.all(results.map((row) => rowToMonitor(row, source)));
}

export async function getMonitor(db: D1Database, id: string, source: BackendSource = DEFAULT_SOURCE): Promise<Monitor | null> {
  const row = await db.prepare(
    `${selectMonitorSql()}
     WHERE m.id = ? AND m.archived_at IS NULL
     LIMIT 1`,
  ).bind(id).first<MonitorRow>();

  return row ? rowToMonitor(row, source) : null;
}

export async function createMonitor(db: D1Database, input: CreateMonitorInput, source: BackendSource = DEFAULT_SOURCE): Promise<Monitor> {
  const normalized = normalizeConfig(input.type, input.config);
  const now = Math.floor(Date.now() / 1000);
  const id = crypto.randomUUID();

  await db.prepare(
    `INSERT INTO monitors (
       id, backend_id, name, type, target, interval_sec, timeout_sec,
       expected_json, config_json, paused, public_visible, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
  ).bind(
    id,
    source.backend_id,
    input.name,
    input.type,
    normalized.target,
    input.interval_sec,
    input.timeout_sec,
    normalized.expected ? JSON.stringify(normalized.expected) : null,
    JSON.stringify(normalized.config),
    input.public_visible ? 1 : 0,
    now,
    now,
  ).run();

  const monitor = await getMonitor(db, id, source);
  if (!monitor) throw new Error("Created monitor could not be loaded");
  return monitor;
}

export async function updateMonitor(db: D1Database, id: string, input: UpdateMonitorInput, source: BackendSource = DEFAULT_SOURCE): Promise<Monitor | null> {
  const current = await db.prepare(
    "SELECT id, type, config_json FROM monitors WHERE id = ? AND archived_at IS NULL",
  ).bind(id).first<{ id: string; type: MonitorType; config_json: string }>();
  if (!current) return null;

  const currentConfig = safeJson(current.config_json);
  const normalized = input.config === undefined
    ? normalizeConfig(current.type, currentConfig)
    : normalizeConfig(current.type, input.config);
  const existing = await getMonitor(db, id, source);
  const nextPublicVisible = input.public_visible ?? existing?.public_visible ?? true;
  const now = Math.floor(Date.now() / 1000);

  await db.prepare(
    `UPDATE monitors
     SET name = ?, target = ?, interval_sec = ?, timeout_sec = ?, expected_json = ?,
         config_json = ?, public_visible = ?, updated_at = ?
     WHERE id = ? AND archived_at IS NULL`,
  ).bind(
    input.name ?? existing?.name,
    normalized.target,
    input.interval_sec ?? existing?.interval_sec,
    input.timeout_sec ?? existing?.timeout_sec,
    normalized.expected ? JSON.stringify(normalized.expected) : null,
    JSON.stringify(normalized.config),
    nextPublicVisible ? 1 : 0,
    now,
    id,
  ).run();

  return getMonitor(db, id, source);
}

export async function setMonitorPaused(db: D1Database, id: string, paused: boolean, source: BackendSource = DEFAULT_SOURCE): Promise<Monitor | null> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db.prepare(
    "UPDATE monitors SET paused = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL",
  ).bind(paused ? 1 : 0, now, id).run();
  if (!result.meta.changes) return null;
  return getMonitor(db, id, source);
}

export async function archiveMonitor(db: D1Database, id: string, source: BackendSource = DEFAULT_SOURCE): Promise<Monitor | null> {
  const monitor = await getMonitor(db, id, source);
  if (!monitor) return null;
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(
    "UPDATE monitors SET archived_at = ?, paused = 1, updated_at = ? WHERE id = ? AND archived_at IS NULL",
  ).bind(now, now, id).run();
  return { ...monitor, status: "paused", updated_at: now };
}

function selectMonitorSql() {
  return `SELECT
       m.id, m.backend_id, m.name, m.type, m.target, m.interval_sec, m.timeout_sec,
       m.expected_json, m.config_json, m.paused, m.public_visible, m.created_at, m.updated_at,
       ml.status AS latest_status, ml.checked_at, ml.latency_ms, ml.uptime_ratio,
       ml.cpu_percent, ml.mem_percent, ml.error_text,
       (
         SELECT cr.detail_json
         FROM check_results cr
         WHERE cr.monitor_id = m.id
         ORDER BY cr.timestamp DESC, cr.id DESC
         LIMIT 1
       ) AS last_detail_json,
       (
         SELECT am.payload_json
         FROM agent_metrics am
         WHERE am.monitor_id = m.id
         ORDER BY am.timestamp DESC, am.id DESC
         LIMIT 1
       ) AS last_agent_payload_json
     FROM monitors m
     LEFT JOIN monitor_latest ml ON ml.monitor_id = m.id`;
}

function normalizeConfig(type: MonitorType, value: unknown): NormalizedConfig {
  if (type === "agent") {
    const result = agentMonitorConfigSchema.safeParse(value ?? {});
    if (!result.success) throw new MonitorValidationError("Invalid agent monitor config");
    return { config: result.data, target: "Agent probe", expected: null };
  }

  if (type === "http") {
    const result = httpMonitorConfigSchema.safeParse(value);
    if (!result.success) throw new MonitorValidationError("Invalid HTTP monitor config");
    return {
      config: result.data,
      target: result.data.url,
      expected: { status_code: result.data.expected_status },
    };
  }

  const result = tcpMonitorConfigSchema.safeParse(value);
  if (!result.success) throw new MonitorValidationError("Invalid TCP monitor config");
  return {
    config: result.data,
    target: `${result.data.host}:${result.data.port}`,
    expected: null,
  };
}

async function rowToMonitor(row: MonitorRow, source: BackendSource): Promise<Monitor> {
  const status = row.paused ? "paused" : row.latest_status ?? "unknown";
  return monitorSchema.parse({
    backend_id: row.backend_id || source.backend_id,
    backend_label: source.backend_label,
    backend_type: source.backend_type,
    id: row.id,
    name: row.name,
    type: row.type,
    status,
    target: targetSummary(row.type, row.target, safeJson(row.config_json)),
    interval_sec: row.interval_sec,
    timeout_sec: row.timeout_sec,
    public_visible: Boolean(row.public_visible),
    latest: {
      checked_at: row.checked_at,
      latency_ms: row.latency_ms,
      uptime_ratio: row.uptime_ratio,
      cpu_percent: row.cpu_percent,
      mem_percent: row.mem_percent,
      error_text: row.error_text,
      status_code: latestStatusCode(row.last_detail_json),
      containers: row.type === "agent" ? await latestContainers(row.last_agent_payload_json) : null,
    },
    visibility: {
      public: Boolean(row.public_visible),
      show_uptime: true,
      show_latency: true,
      show_incidents: true,
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
}

async function latestContainers(payloadJson: string | null) {
  const containersJson = safeJson(payloadJson).containers_json;
  if (typeof containersJson !== "string" || containersJson.trim().length === 0) return null;

  try {
    const decompressed = await decompress(containersJson);
    const containers = JSON.parse(decompressed) as unknown;
    return Array.isArray(containers) ? containers : null;
  } catch {
    return null;
  }
}

function latestStatusCode(detailJson: string | null): number | null {
  const value = safeJson(detailJson).status_code;
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
}

function targetSummary(type: MonitorType, target: string | null, config: Record<string, unknown>) {
  if (type === "http") {
    const url = String(config.url ?? target ?? "");
    return { label: url, url };
  }
  if (type === "tcp") {
    const host = String(config.host ?? "");
    const port = Number(config.port);
    return { label: target ?? `${host}:${port}`, host, port };
  }
  return { label: target ?? "Agent probe" };
}

function safeJson(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}
