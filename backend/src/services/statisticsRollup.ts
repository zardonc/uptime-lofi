import type { Bindings } from "../routes/api";

export type StatisticsRange = "24h" | "7d" | "30d";

type BackendSource = {
  readonly backend_id: string;
  readonly backend_label: string;
  readonly backend_type: "cloudflare_worker";
};

export type StatisticsSummary = BackendSource & {
  readonly range: StatisticsRange;
  readonly generated_at: number;
  readonly total_monitors: number;
  readonly online_monitors: number;
  readonly incident_count: number;
  readonly total_downtime_sec: number;
  readonly avg_latency_ms: number | null;
  readonly uptime_ratio: number | null;
};

export type StatisticsLeaderboardEntry = {
  readonly monitor_id: string;
  readonly monitor_name: string;
  readonly monitor_type: "agent" | "http" | "tcp";
  readonly value: number;
  readonly label: string;
  readonly sample_count: number;
};

export type StatisticsLeaderboards = BackendSource & {
  readonly range: StatisticsRange;
  readonly generated_at: number;
  readonly downtime: ReadonlyArray<StatisticsLeaderboardEntry>;
  readonly slowest: ReadonlyArray<StatisticsLeaderboardEntry>;
  readonly resource_heavy: ReadonlyArray<StatisticsLeaderboardEntry>;
};

export type AvailabilityTrendPoint = {
  readonly date: string;
  readonly uptime_ratio: number | null;
  readonly down_count: number;
  readonly check_count: number;
};

export type SystemLoadTrendPoint = {
  readonly time: string;
  readonly cpu_percent: number | null;
  readonly mem_percent: number | null;
  readonly sample_count: number;
};

export type StatisticsTrends = BackendSource & {
  readonly range: StatisticsRange;
  readonly generated_at: number;
  readonly availability: ReadonlyArray<AvailabilityTrendPoint>;
  readonly system_load: ReadonlyArray<SystemLoadTrendPoint>;
};

type CacheEnvelope<T> = {
  readonly version: number;
  readonly generated_at: number;
  readonly range: StatisticsRange;
  readonly data: T;
};

type CacheResult<T> = {
  readonly data: T;
  readonly cache: "hit" | "miss";
};

const CACHE_VERSION = 1;
const CACHE_TTL_SECONDS = 3600;
const RANGES: ReadonlyArray<StatisticsRange> = ["24h", "7d", "30d"];

export function normalizeStatisticsRange(value: string | null | undefined): StatisticsRange {
  return value === "24h" || value === "30d" ? value : "7d";
}

export async function refreshStatistics(
  env: Pick<Bindings, "DB" | "STATISTICS_CACHE">,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<void> {
  await refreshDailySummaries(env.DB, nowSeconds);

  if (!env.STATISTICS_CACHE) return;
  await Promise.all(RANGES.flatMap(async (range) => {
    const [summary, leaderboards, trends] = await Promise.all([
      buildStatisticsSummary(env.DB, range, nowSeconds),
      buildStatisticsLeaderboards(env.DB, range, nowSeconds),
      buildStatisticsTrends(env.DB, range, nowSeconds),
    ]);
    return Promise.all([
      writeCache(env.STATISTICS_CACHE, cacheKey("summary", range), range, summary),
      writeCache(env.STATISTICS_CACHE, cacheKey("leaderboards", range), range, leaderboards),
      writeCache(env.STATISTICS_CACHE, cacheKey("trends", range), range, trends),
    ]);
  }));
}

export async function getStatisticsSummary(
  env: Pick<Bindings, "DB" | "STATISTICS_CACHE">,
  range: StatisticsRange,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<CacheResult<StatisticsSummary>> {
  const cached = await readCache<StatisticsSummary>(env.STATISTICS_CACHE, cacheKey("summary", range), range);
  if (cached) return { data: cached, cache: "hit" };

  const data = await buildStatisticsSummary(env.DB, range, nowSeconds);
  await writeCache(env.STATISTICS_CACHE, cacheKey("summary", range), range, data);
  return { data, cache: "miss" };
}

export async function getStatisticsLeaderboards(
  env: Pick<Bindings, "DB" | "STATISTICS_CACHE">,
  range: StatisticsRange,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<CacheResult<StatisticsLeaderboards>> {
  const cached = await readCache<StatisticsLeaderboards>(env.STATISTICS_CACHE, cacheKey("leaderboards", range), range);
  if (cached) return { data: cached, cache: "hit" };

  const data = await buildStatisticsLeaderboards(env.DB, range, nowSeconds);
  await writeCache(env.STATISTICS_CACHE, cacheKey("leaderboards", range), range, data);
  return { data, cache: "miss" };
}

export async function getStatisticsTrends(
  env: Pick<Bindings, "DB" | "STATISTICS_CACHE">,
  range: StatisticsRange,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<CacheResult<StatisticsTrends>> {
  const cached = await readCache<StatisticsTrends>(env.STATISTICS_CACHE, cacheKey("trends", range), range);
  if (cached) return { data: cached, cache: "hit" };

  const data = await buildStatisticsTrends(env.DB, range, nowSeconds);
  await writeCache(env.STATISTICS_CACHE, cacheKey("trends", range), range, data);
  return { data, cache: "miss" };
}

export async function refreshDailySummaries(db: D1Database, nowSeconds = Math.floor(Date.now() / 1000)): Promise<void> {
  const since = nowSeconds - 30 * 86400;
  await db.prepare(
    `INSERT INTO daily_summaries (
       monitor_id, date, check_count, up_count, warn_count, down_count,
       avg_latency_ms, p95_latency_ms, downtime_sec, updated_at
     )
     SELECT
       cr.monitor_id,
       strftime('%Y-%m-%d', cr.timestamp, 'unixepoch') AS date,
       COUNT(*) AS check_count,
       SUM(CASE WHEN cr.status = 'up' THEN 1 ELSE 0 END) AS up_count,
       SUM(CASE WHEN cr.status = 'warn' THEN 1 ELSE 0 END) AS warn_count,
       SUM(CASE WHEN cr.status = 'down' THEN 1 ELSE 0 END) AS down_count,
       AVG(cr.latency_ms) AS avg_latency_ms,
       MAX(cr.latency_ms) AS p95_latency_ms,
       SUM(CASE WHEN cr.status = 'down' THEN m.interval_sec ELSE 0 END) AS downtime_sec,
       ? AS updated_at
     FROM check_results cr
     JOIN monitors m ON m.id = cr.monitor_id
     WHERE cr.timestamp >= ?
     GROUP BY cr.monitor_id, date
     ON CONFLICT(monitor_id, date) DO UPDATE SET
       check_count = excluded.check_count,
       up_count = excluded.up_count,
       warn_count = excluded.warn_count,
       down_count = excluded.down_count,
       avg_latency_ms = excluded.avg_latency_ms,
       p95_latency_ms = excluded.p95_latency_ms,
       downtime_sec = excluded.downtime_sec,
       updated_at = excluded.updated_at`,
  ).bind(nowSeconds, since).run();
}

async function buildStatisticsSummary(
  db: D1Database,
  range: StatisticsRange,
  nowSeconds: number,
): Promise<StatisticsSummary> {
  const since = nowSeconds - rangeSeconds(range);
  const [monitors, checks, alerts] = await Promise.all([
    db.prepare(
      `SELECT COUNT(*) AS total_monitors,
              SUM(CASE WHEN ml.status = 'online' AND m.paused = 0 THEN 1 ELSE 0 END) AS online_monitors
       FROM monitors m
       LEFT JOIN monitor_latest ml ON ml.monitor_id = m.id
       WHERE m.archived_at IS NULL`,
    ).first<{ total_monitors: number | null; online_monitors: number | null }>(),
    db.prepare(
      `SELECT COUNT(*) AS check_count,
              SUM(CASE WHEN status IN ('up', 'warn') THEN 1 ELSE 0 END) AS available_count,
              AVG(latency_ms) AS avg_latency_ms,
              SUM(CASE WHEN status = 'down' THEN m.interval_sec ELSE 0 END) AS total_downtime_sec
       FROM check_results cr
       JOIN monitors m ON m.id = cr.monitor_id
       WHERE cr.timestamp >= ? AND m.archived_at IS NULL`,
    ).bind(since).first<{
      check_count: number | null;
      available_count: number | null;
      avg_latency_ms: number | null;
      total_downtime_sec: number | null;
    }>(),
    db.prepare("SELECT COUNT(*) AS incident_count FROM alert_events WHERE created_at >= ?")
      .bind(since)
      .first<{ incident_count: number | null }>(),
  ]);

  const checkCount = checks?.check_count ?? 0;
  const availableCount = checks?.available_count ?? 0;
  return {
    ...backendSource(),
    range,
    generated_at: nowSeconds,
    total_monitors: monitors?.total_monitors ?? 0,
    online_monitors: monitors?.online_monitors ?? 0,
    incident_count: alerts?.incident_count ?? 0,
    total_downtime_sec: checks?.total_downtime_sec ?? 0,
    avg_latency_ms: roundNullable(checks?.avg_latency_ms ?? null),
    uptime_ratio: checkCount > 0 ? round((availableCount / checkCount) * 100, 2) : null,
  };
}

async function buildStatisticsLeaderboards(
  db: D1Database,
  range: StatisticsRange,
  nowSeconds: number,
): Promise<StatisticsLeaderboards> {
  const since = nowSeconds - rangeSeconds(range);
  const [downtime, slowest, resources] = await Promise.all([
    db.prepare(
      `SELECT m.id AS monitor_id, m.name AS monitor_name, m.type AS monitor_type,
              SUM(CASE WHEN cr.status = 'down' THEN m.interval_sec ELSE 0 END) AS value,
              COUNT(*) AS sample_count
       FROM check_results cr
       JOIN monitors m ON m.id = cr.monitor_id
       WHERE cr.timestamp >= ? AND m.archived_at IS NULL
       GROUP BY m.id, m.name, m.type
       HAVING value > 0
       ORDER BY value DESC, sample_count DESC
       LIMIT 5`,
    ).bind(since).all<LeaderboardRow>(),
    db.prepare(
      `SELECT m.id AS monitor_id, m.name AS monitor_name, m.type AS monitor_type,
              AVG(cr.latency_ms) AS value,
              COUNT(cr.latency_ms) AS sample_count
       FROM check_results cr
       JOIN monitors m ON m.id = cr.monitor_id
       WHERE cr.timestamp >= ? AND cr.latency_ms IS NOT NULL AND m.archived_at IS NULL
       GROUP BY m.id, m.name, m.type
       HAVING sample_count > 0
       ORDER BY value DESC
       LIMIT 5`,
    ).bind(since).all<LeaderboardRow>(),
    db.prepare(
      `SELECT m.id AS monitor_id, m.name AS monitor_name, m.type AS monitor_type,
              MAX(COALESCE(am.cpu_percent, 0), COALESCE(am.mem_percent, 0)) AS value,
              COUNT(*) AS sample_count
       FROM agent_metrics am
       JOIN monitors m ON m.id = am.monitor_id
       WHERE am.timestamp >= ? AND m.archived_at IS NULL
       GROUP BY m.id, m.name, m.type
       HAVING sample_count > 0
       ORDER BY value DESC
       LIMIT 5`,
    ).bind(since).all<LeaderboardRow>(),
  ]);

  return {
    ...backendSource(),
    range,
    generated_at: nowSeconds,
    downtime: (downtime.results ?? []).map((row) => toLeaderboardEntry(row, "downtime")),
    slowest: (slowest.results ?? []).map((row) => toLeaderboardEntry(row, "latency")),
    resource_heavy: (resources.results ?? []).map((row) => toLeaderboardEntry(row, "resource")),
  };
}

async function buildStatisticsTrends(
  db: D1Database,
  range: StatisticsRange,
  nowSeconds: number,
): Promise<StatisticsTrends> {
  const since = nowSeconds - rangeSeconds(range);
  await refreshDailySummaries(db, nowSeconds);
  const [availability, systemLoad] = await Promise.all([
    db.prepare(
      `SELECT date,
              SUM(check_count) AS check_count,
              SUM(up_count) AS up_count,
              SUM(warn_count) AS warn_count,
              SUM(down_count) AS down_count
       FROM daily_summaries
       WHERE date >= strftime('%Y-%m-%d', ?, 'unixepoch')
       GROUP BY date
       ORDER BY date ASC`,
    ).bind(since).all<{ date: string; check_count: number; up_count: number | null; warn_count: number | null; down_count: number | null }>(),
    db.prepare(
      `SELECT CAST((timestamp / 3600) * 3600 AS INTEGER) AS bucket,
              AVG(cpu_percent) AS cpu_percent,
              AVG(mem_percent) AS mem_percent,
              COUNT(*) AS sample_count
       FROM agent_metrics
       WHERE timestamp >= ?
       GROUP BY bucket
       ORDER BY bucket ASC
       LIMIT 120`,
    ).bind(since).all<{ bucket: number; cpu_percent: number | null; mem_percent: number | null; sample_count: number }>(),
  ]);

  return {
    ...backendSource(),
    range,
    generated_at: nowSeconds,
    availability: (availability.results ?? []).map((row) => ({
      date: row.date,
      uptime_ratio: row.check_count > 0 ? round((((row.up_count ?? 0) + (row.warn_count ?? 0)) / row.check_count) * 100, 2) : null,
      down_count: row.down_count ?? 0,
      check_count: row.check_count,
    })),
    system_load: (systemLoad.results ?? []).map((row) => ({
      time: new Date(row.bucket * 1000).toISOString(),
      cpu_percent: roundNullable(row.cpu_percent),
      mem_percent: roundNullable(row.mem_percent),
      sample_count: row.sample_count,
    })),
  };
}

type LeaderboardRow = {
  readonly monitor_id: string;
  readonly monitor_name: string;
  readonly monitor_type: "agent" | "http" | "tcp";
  readonly value: number | null;
  readonly sample_count: number;
};

function toLeaderboardEntry(row: LeaderboardRow, kind: "downtime" | "latency" | "resource"): StatisticsLeaderboardEntry {
  const value = round(row.value ?? 0, kind === "downtime" ? 0 : 1);
  return {
    monitor_id: row.monitor_id,
    monitor_name: row.monitor_name,
    monitor_type: row.monitor_type,
    value,
    label: formatLeaderboardLabel(value, kind),
    sample_count: row.sample_count,
  };
}

function formatLeaderboardLabel(value: number, kind: "downtime" | "latency" | "resource"): string {
  if (kind === "downtime") return formatDuration(value);
  if (kind === "latency") return `${Math.round(value)}ms`;
  return `${round(value, 1)}%`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function cacheKey(kind: "summary" | "leaderboards" | "trends", range: StatisticsRange): string {
  return `statistics:v${CACHE_VERSION}:${kind}:${range}`;
}

async function readCache<T>(
  cache: KVNamespace | undefined,
  key: string,
  range: StatisticsRange,
): Promise<T | null> {
  if (!cache) return null;
  const raw = await cache.get(key);
  if (!raw) return null;
  try {
    const envelope = JSON.parse(raw) as CacheEnvelope<T>;
    if (envelope.version !== CACHE_VERSION || envelope.range !== range) return null;
    return envelope.data;
  } catch {
    return null;
  }
}

async function writeCache<T>(
  cache: KVNamespace | undefined,
  key: string,
  range: StatisticsRange,
  data: T,
): Promise<void> {
  if (!cache) return;
  const envelope: CacheEnvelope<T> = {
    version: CACHE_VERSION,
    generated_at: Math.floor(Date.now() / 1000),
    range,
    data,
  };
  await cache.put(key, JSON.stringify(envelope), { expirationTtl: CACHE_TTL_SECONDS });
}

function rangeSeconds(range: StatisticsRange): number {
  if (range === "24h") return 86400;
  if (range === "30d") return 30 * 86400;
  return 7 * 86400;
}

function backendSource(): BackendSource {
  return {
    backend_id: "default",
    backend_label: "Default backend",
    backend_type: "cloudflare_worker",
  };
}

function roundNullable(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? round(value, 2) : null;
}

function round(value: number, digits: number): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}
