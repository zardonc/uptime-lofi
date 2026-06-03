import {
  publicStatusResponseSchema,
  type BackendSource,
  type MonitorStatus,
  type PublicStatusResponse,
} from "../schemas/v2";

export type PublicStatusSettings = {
  readonly enabled: boolean;
  readonly private_slug: string | null;
  readonly show_uptime: boolean;
  readonly show_latency: boolean;
  readonly show_incidents: boolean;
  readonly show_monitor_type: boolean;
};

export type PublicStatusSettingsInput = Partial<PublicStatusSettings>;

export type PublicMonitorVisibilityInput = {
  readonly id: string;
  readonly public_visible: boolean;
};

const SETTINGS_KEY = "public_status_config";

export const DEFAULT_PUBLIC_STATUS_SETTINGS: PublicStatusSettings = {
  enabled: false,
  private_slug: null,
  show_uptime: true,
  show_latency: true,
  show_incidents: true,
  show_monitor_type: true,
};

type PublicMonitorRow = {
  id: string;
  name: string;
  type: "agent" | "http" | "tcp";
  target: string | null;
  public_visible: number;
  status: MonitorStatus | null;
  checked_at: number | null;
  latency_ms: number | null;
  uptime_ratio: number | null;
  updated_at: number | null;
  last_detail_json: string | null;
};

export async function readPublicStatusSettings(db: D1Database): Promise<PublicStatusSettings> {
  const stored = await db.prepare("SELECT value FROM kv_settings WHERE key = ?").bind(SETTINGS_KEY).first<{ value: string }>();
  if (!stored?.value) return DEFAULT_PUBLIC_STATUS_SETTINGS;

  try {
    return normalizePublicStatusSettings(JSON.parse(stored.value) as PublicStatusSettingsInput);
  } catch {
    return DEFAULT_PUBLIC_STATUS_SETTINGS;
  }
}

export async function savePublicStatusSettings(db: D1Database, input: PublicStatusSettingsInput): Promise<PublicStatusSettings> {
  const current = await readPublicStatusSettings(db);
  const next = normalizePublicStatusSettings({ ...current, ...input });
  await db.prepare("INSERT OR REPLACE INTO kv_settings (key, value) VALUES (?, ?)")
    .bind(SETTINGS_KEY, JSON.stringify(next))
    .run();
  return next;
}

export async function updatePublicMonitorVisibility(db: D1Database, monitors: ReadonlyArray<PublicMonitorVisibilityInput>): Promise<void> {
  if (monitors.length === 0) return;
  await db.batch(monitors.map((monitor) => db.prepare(
    "UPDATE monitors SET public_visible = ?, updated_at = strftime('%s', 'now') WHERE id = ? AND archived_at IS NULL",
  ).bind(monitor.public_visible ? 1 : 0, monitor.id)));
}

export async function listPublicMonitorVisibility(db: D1Database): Promise<ReadonlyArray<PublicMonitorVisibilityInput>> {
  const { results } = await db.prepare(
    "SELECT id, public_visible FROM monitors WHERE archived_at IS NULL ORDER BY created_at DESC",
  ).all<{ id: string; public_visible: number }>();

  return results.map((monitor) => ({
    id: monitor.id,
    public_visible: Boolean(monitor.public_visible),
  }));
}

export async function buildPublicStatusResponse(
  db: D1Database,
  backendSource: BackendSource,
  slug: string | null,
): Promise<PublicStatusResponse | null> {
  const settings = await readPublicStatusSettings(db);
  if (!settings.enabled) return null;
  if (settings.private_slug && settings.private_slug !== slug) return null;

  const rows = await db.prepare(
    `SELECT m.id, m.name, m.type, m.target, m.public_visible,
            ml.status, ml.checked_at, ml.latency_ms, ml.uptime_ratio, ml.updated_at,
            (
              SELECT cr.detail_json
              FROM check_results cr
              WHERE cr.monitor_id = m.id
              ORDER BY cr.timestamp DESC, cr.id DESC
              LIMIT 1
            ) AS last_detail_json
       FROM monitors m
       LEFT JOIN monitor_latest ml ON ml.monitor_id = m.id
      WHERE m.archived_at IS NULL AND m.public_visible = 1
      ORDER BY lower(m.name) ASC`,
  ).all<PublicMonitorRow>();

  const now = Math.floor(Date.now() / 1000);
  const monitors = (rows.results ?? []).map((row) => {
    const publicMonitor = {
      ...backendSource,
      id: row.id,
      name: row.name,
      ...(settings.show_monitor_type ? { type: row.type } : {}),
      status: row.status ?? "unknown",
      target_label: publicTargetLabel(row),
      ...(settings.show_latency ? { latency_ms: row.latency_ms } : {}),
      ...(settings.show_uptime ? { uptime_ratio: row.uptime_ratio } : {}),
      ...(latestStatusCode(row.last_detail_json) === 403 ? { status_code: 403 } : {}),
      updated_at: row.updated_at ?? row.checked_at ?? now,
    };
    return publicMonitor;
  });

  const status = overallStatus(monitors.map((monitor) => monitor.status));
  return publicStatusResponseSchema.parse({
    status,
    message: messageForStatus(status, monitors.length),
    updated_at: monitors.reduce((latest, monitor) => Math.max(latest, monitor.updated_at), now),
    monitors,
    incidents: settings.show_incidents ? [] : [],
  });
}

function latestStatusCode(detailJson: string | null): number | null {
  if (!detailJson) return null;
  try {
    const value = (JSON.parse(detailJson) as { readonly status_code?: unknown }).status_code;
    return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
  } catch {
    return null;
  }
}

function normalizePublicStatusSettings(input: PublicStatusSettingsInput): PublicStatusSettings {
  const slug = typeof input.private_slug === "string" ? input.private_slug.trim() : input.private_slug;
  return {
    enabled: input.enabled ?? DEFAULT_PUBLIC_STATUS_SETTINGS.enabled,
    private_slug: slug ? slug : null,
    show_uptime: input.show_uptime ?? DEFAULT_PUBLIC_STATUS_SETTINGS.show_uptime,
    show_latency: input.show_latency ?? DEFAULT_PUBLIC_STATUS_SETTINGS.show_latency,
    show_incidents: input.show_incidents ?? DEFAULT_PUBLIC_STATUS_SETTINGS.show_incidents,
    show_monitor_type: input.show_monitor_type ?? DEFAULT_PUBLIC_STATUS_SETTINGS.show_monitor_type,
  };
}

function publicTargetLabel(row: PublicMonitorRow): string | undefined {
  if (row.type === "agent") return "Agent probe";
  if (row.type === "tcp") return "TCP endpoint";
  if (row.type === "http") {
    try {
      const target = row.target ? new URL(row.target) : null;
      return target?.host || "HTTP check";
    } catch {
      return "HTTP check";
    }
  }
  return undefined;
}

function overallStatus(statuses: ReadonlyArray<MonitorStatus>): MonitorStatus {
  if (statuses.length === 0) return "unknown";
  if (statuses.includes("offline")) return "offline";
  if (statuses.includes("degraded")) return "degraded";
  if (statuses.every((status) => status === "online")) return "online";
  return "unknown";
}

function messageForStatus(status: MonitorStatus, count: number): string {
  if (count === 0) return "No public monitors are currently visible.";
  if (status === "online") return "All public systems are operational.";
  if (status === "degraded") return "Some public systems are degraded.";
  if (status === "offline") return "One or more public systems are offline.";
  return "Public status is waiting for fresh monitor data.";
}
