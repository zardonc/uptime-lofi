// ═══════════════════════════════════════════
// Shared API response types — Uptime LoFi
// ═══════════════════════════════════════════

export type NodeStatus = 'online' | 'degraded' | 'offline' | 'paused';

export type NodeType = 'agent_push' | 'agentless_http' | 'agentless_tcp';

export interface BackendSource {
  readonly backend_id: string;
  readonly backend_label: string;
  readonly backend_type?: 'cloudflare_worker' | 'custom';
}

export type MonitorType = 'agent' | 'http' | 'tcp';

export type MonitorStatus = 'online' | 'degraded' | 'offline' | 'paused' | 'unknown';

export interface MonitorTargetSummary {
  readonly label: string;
  readonly host?: string;
  readonly port?: number;
  readonly url?: string;
}

export interface MonitorLatestMetrics {
  readonly checked_at: number | null;
  readonly latency_ms: number | null;
  readonly uptime_ratio: number | null;
  readonly cpu_percent: number | null;
  readonly mem_percent: number | null;
  readonly error_text: string | null;
}

export interface MonitorVisibility {
  readonly public: boolean;
  readonly show_uptime: boolean;
  readonly show_latency: boolean;
  readonly show_incidents: boolean;
}

export interface Monitor extends BackendSource {
  readonly id: string;
  readonly name: string;
  readonly type: MonitorType;
  readonly status: MonitorStatus;
  readonly target: MonitorTargetSummary;
  readonly interval_sec: number;
  readonly timeout_sec: number;
  readonly public_visible: boolean;
  readonly latest: MonitorLatestMetrics;
  readonly visibility: MonitorVisibility;
  readonly created_at: number;
  readonly updated_at: number;
}

export interface CreateMonitorRequest {
  readonly name: string;
  readonly type: MonitorType;
  readonly interval_sec?: number;
  readonly timeout_sec?: number;
  readonly config?: Record<string, unknown>;
  readonly public_visible?: boolean;
}

export interface UpdateMonitorRequest {
  readonly name?: string;
  readonly interval_sec?: number;
  readonly timeout_sec?: number;
  readonly config?: Record<string, unknown>;
  readonly public_visible?: boolean;
}

export interface PublicMonitor extends BackendSource {
  readonly id: string;
  readonly name: string;
  readonly type?: MonitorType;
  readonly status: MonitorStatus;
  readonly target_label?: string;
  readonly latency_ms?: number | null;
  readonly uptime_ratio?: number | null;
  readonly updated_at: number;
}

export interface PublicIncident {
  readonly id: string;
  readonly title: string;
  readonly status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  readonly started_at: number;
  readonly resolved_at: number | null;
}

export interface PublicStatusResponse {
  readonly status: MonitorStatus;
  readonly message: string;
  readonly updated_at: number;
  readonly monitors: ReadonlyArray<PublicMonitor>;
  readonly incidents: ReadonlyArray<PublicIncident>;
}

export interface PublicStatusSettings {
  readonly enabled: boolean;
  readonly private_slug: string | null;
  readonly show_uptime: boolean;
  readonly show_latency: boolean;
  readonly show_incidents: boolean;
  readonly show_monitor_type: boolean;
}

export interface SettingsResponse {
  readonly is_ui_lock_enabled: boolean;
  readonly public_status: PublicStatusSettings;
}

export interface AlertRule extends BackendSource {
  readonly id: string;
  readonly name: string;
  readonly monitor_id: string | null;
  readonly condition: AlertCondition;
  readonly params: Readonly<Record<string, unknown>>;
  readonly channel_ids: ReadonlyArray<string>;
  readonly enabled: boolean;
  readonly severity: 'info' | 'warning' | 'critical';
  readonly confirm_for_sec: number;
  readonly repeat_interval_sec: number;
  readonly silent_hours: { readonly start: string; readonly end: string } | null;
  readonly timezone: string;
  readonly created_at: number;
  readonly updated_at: number;
}

export type AlertCondition = 'offline' | 'latency' | 'http_status' | 'cpu' | 'memory';

export interface CreateAlertRuleRequest {
  readonly name: string;
  readonly monitor_id: string;
  readonly condition: AlertCondition;
  readonly params?: Record<string, unknown>;
  readonly channel_ids?: ReadonlyArray<string>;
  readonly enabled?: boolean;
  readonly severity?: 'info' | 'warning' | 'critical';
  readonly confirm_for_sec?: number;
  readonly repeat_interval_sec?: number;
  readonly silent_hours?: { readonly start: string; readonly end: string } | null;
  readonly timezone?: string;
}

export type UpdateAlertRuleRequest = Partial<CreateAlertRuleRequest>;

export interface AlertEvent extends BackendSource {
  readonly id: string;
  readonly rule_id: string;
  readonly monitor_id: string;
  readonly monitor_name: string;
  readonly rule_name: string;
  readonly event_type: 'pending' | 'firing' | 'suppressed' | 'recovered';
  readonly severity: 'info' | 'warning' | 'critical';
  readonly message: string;
  readonly notification_status: 'pending' | 'suppressed' | 'not_required';
  readonly created_at: number;
}

export interface NotificationChannel extends BackendSource {
  readonly id: string;
  readonly name: string;
  readonly type: 'webhook' | 'telegram' | 'email';
  readonly enabled: boolean;
  readonly has_secret: boolean;
  readonly redacted_label: string | null;
  readonly delivery_status: 'untested' | 'ok' | 'failing' | 'disabled';
  readonly updated_at: number;
}

export interface StatisticsSummary extends BackendSource {
  readonly range: '24h' | '7d' | '30d' | 'custom';
  readonly generated_at: number;
  readonly total_monitors: number;
  readonly online_monitors: number;
  readonly incident_count: number;
  readonly avg_latency_ms: number | null;
  readonly uptime_ratio: number | null;
}

export interface StructuredApiError {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly request_id?: string;
  };
}

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
