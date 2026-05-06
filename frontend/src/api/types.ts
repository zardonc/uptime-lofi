// ═══════════════════════════════════════════
// Shared API response types — Uptime LoFi
// ═══════════════════════════════════════════

export type NodeStatus = 'online' | 'degraded' | 'offline' | 'paused';

export type NodeType = 'agent_push' | 'agentless_http' | 'agentless_tcp';

export interface AgentlessHttpConfig {
  readonly url: string;
  readonly interval: number;
  readonly timeout: number;
  readonly interval_seconds?: number;
  readonly timeout_seconds?: number;
  readonly expected_status: number;
}

export interface AgentlessTcpConfig {
  readonly host: string;
  readonly port: number;
  readonly interval: number;
  readonly timeout: number;
  readonly interval_seconds?: number;
  readonly timeout_seconds?: number;
}

export type AgentlessCheckType = Extract<NodeType, 'agentless_http' | 'agentless_tcp'>;

export interface AgentlessLatestResult {
  readonly timestamp: number | null;
  readonly is_up: boolean | null;
  readonly latency_ms: number | null;
  readonly error_text: string | null;
}

export interface AgentlessCheck {
  readonly id: string;
  readonly name: string;
  readonly type: AgentlessCheckType;
  readonly status: NodeStatus;
  readonly config?: AgentlessHttpConfig | AgentlessTcpConfig | null;
  readonly config_json?: string;
  readonly target?: string;
  readonly interval_seconds?: number;
  readonly interval?: number;
  readonly timeout_seconds?: number;
  readonly timeout?: number;
  readonly expected_status?: number;
  readonly latest_ping_ms?: number | null;
  readonly latest_is_up?: boolean | number | null;
  readonly latest_error_text?: string | null;
  readonly latest_timestamp?: number | null;
  readonly latest_result: AgentlessLatestResult | null;
  readonly tcp_available?: boolean;
  readonly disabled_reason?: string | null;
}

export interface CreateHttpCheckRequest {
  readonly name: string;
  readonly url: string;
  readonly interval: number;
  readonly timeout: number;
  readonly expected_status: number;
}

export interface CreateTcpCheckRequest {
  readonly name: string;
  readonly host: string;
  readonly port: number;
  readonly interval: number;
  readonly timeout: number;
}

export type NodeConfig = Record<string, unknown> | AgentlessHttpConfig | AgentlessTcpConfig;

export interface ApiNode {
  readonly id: string;
  readonly name: string;
  readonly type: NodeType;
  readonly status: NodeStatus;
  readonly last_heartbeat: number | null;
  readonly ping_ms: number | null;
  readonly cpu_usage: number | null;
  readonly mem_usage: number | null;
  readonly uptime_ratio: number | null;
  readonly config: NodeConfig | null;
}

export interface UpdateNodeRequest {
  readonly name?: string;
  readonly status?: Extract<NodeStatus, 'offline' | 'paused'>;
  readonly config?: NodeConfig;
}

export interface DeleteNodeResponse {
  readonly id: string;
  readonly archived_at: number;
}

export interface ApiContainerMetric {
  readonly id?: string;
  readonly name?: string;
  readonly image?: string;
  readonly state?: string;
  readonly status?: string;
  readonly cpu_percent?: number | null;
  readonly mem_percent?: number | null;
  readonly updated_at?: number | null;
}

export interface ApiMetric {
  readonly id: number;
  readonly node_id: string;
  readonly timestamp: number;
  readonly cpu_percent: number | null;
  readonly mem_percent: number | null;
  readonly ping_ms: number | null;
  readonly containers: ReadonlyArray<ApiContainerMetric> | null;
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

export type ProbePlatform = 'linux/amd64' | 'linux/arm64' | 'darwin/amd64' | 'darwin/arm64';

export type ProbeDownloadKey = 'linux_amd64' | 'linux_arm64' | 'darwin_amd64' | 'darwin_arm64';

export interface ProbeConfigRequest {
  readonly name: string;
  readonly platform?: ProbePlatform;
}

export interface ProbeConfigData {
  readonly node_id: string;
  readonly node_name: string;
  readonly node_secret: string;
  readonly probe_push_url: string;
  readonly install_command: string;
  readonly install_script_url: string;
  readonly config_yaml: string;
  readonly downloads: Readonly<Record<ProbeDownloadKey, string>>;
}

export type ProbeConfigResponse = ApiResponse<ProbeConfigData>;
