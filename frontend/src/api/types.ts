// ═══════════════════════════════════════════
// Shared API response types — Uptime LoFi
// ═══════════════════════════════════════════

export type NodeStatus = 'online' | 'degraded' | 'offline' | 'paused';

export interface ApiNode {
  readonly id: string;
  readonly name: string;
  readonly status: NodeStatus;
  readonly last_heartbeat: number;
  readonly ping_ms: number | null;
  readonly cpu_usage: number | null;
  readonly mem_usage: number | null;
  readonly uptime_ratio: number | null;
  readonly config: Record<string, unknown> | null;
}

export interface ApiMetric {
  readonly id: number;
  readonly node_id: string;
  readonly timestamp: number;
  readonly cpu_percent: number | null;
  readonly mem_percent: number | null;
  readonly ping_ms: number | null;
  readonly containers: unknown[] | null;
}

export interface OverviewStats {
  readonly totalNodes: number;
  readonly onlineNodes: number;
  readonly avgUptimeRatio: number;
  readonly avgPing: number;
}

export interface ApiResponse<T> {
  readonly data: T;
}

export interface ApiError {
  readonly error: string;
}

export interface LoginResponse {
  readonly access_token: string;
}

export interface TrendPoint {
  readonly time: string;
  readonly cpu: number;
  readonly mem: number;
  readonly ping: number;
}
