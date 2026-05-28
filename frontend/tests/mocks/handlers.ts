import { http, HttpResponse } from "msw";
import type {
  AgentlessCheck,
  AlertEvent,
  AlertRule,
  ApiMetric,
  ApiNode,
  Monitor,
  MonitorType,
  NotificationChannel,
  OverviewStats,
  PublicStatusSettings,
  StatisticsLeaderboards,
  StatisticsSummary,
  StatisticsTrends,
} from "../../src/api/types";

interface MockAuthState {
  readonly authenticated: boolean;
  readonly isUiLockEnabled: boolean;
  readonly password: string;
  readonly accessToken: string;
  readonly refreshToken: string;
}

interface MockApiState {
  readonly auth: MockAuthState;
  readonly nodes: ReadonlyArray<ApiNode>;
  readonly monitors: ReadonlyArray<Monitor>;
  readonly notificationChannels: ReadonlyArray<NotificationChannel>;
  readonly alertRules: ReadonlyArray<AlertRule>;
  readonly alertEvents: ReadonlyArray<AlertEvent>;
  readonly agentlessChecks: ReadonlyArray<AgentlessCheck>;
  readonly overview: OverviewStats;
  readonly statistics: {
    readonly summary: StatisticsSummary;
    readonly leaderboards: StatisticsLeaderboards;
    readonly trends: StatisticsTrends;
  };
  readonly metricsByNode: Readonly<Record<string, ReadonlyArray<ApiMetric>>>;
  readonly publicStatus: PublicStatusSettings;
  readonly failSettingsUpdate: boolean;
}

function createMockNodes(): ReadonlyArray<ApiNode> {
  const now = Math.floor(Date.now() / 1000);

  return [
    {
      id: "node-1",
      name: "edge-sfo-1",
      type: "agent_push",
      status: "online",
      last_heartbeat: now - 45,
      ping_ms: 18,
      cpu_usage: 24,
      mem_usage: 58,
      uptime_ratio: 99.9,
      config: null,
    },
    {
      id: "node-2",
      name: "edge-fra-1",
      type: "agent_push",
      status: "offline",
      last_heartbeat: now - 600,
      ping_ms: null,
      cpu_usage: null,
      mem_usage: null,
      uptime_ratio: 87.2,
      config: null,
    },
  ];
}

function createMockMonitors(): ReadonlyArray<Monitor> {
  const now = Math.floor(Date.now() / 1000);

  return [
    {
      id: "monitor-agent-1",
      backend_id: "default",
      backend_label: "Default backend",
      backend_type: "cloudflare_worker",
      name: "edge-sfo-1",
      type: "agent",
      status: "online",
      target: { label: "Agent probe" },
      interval_sec: 60,
      timeout_sec: 10,
      public_visible: true,
      latest: { checked_at: now - 45, latency_ms: 18, uptime_ratio: 99.9, cpu_percent: 24, mem_percent: 58, error_text: null },
      visibility: { public: true, show_uptime: true, show_latency: true, show_incidents: true },
      created_at: now - 3600,
      updated_at: now - 45,
    },
    {
      id: "monitor-http-1",
      backend_id: "default",
      backend_label: "Default backend",
      backend_type: "cloudflare_worker",
      name: "Homepage",
      type: "http",
      status: "unknown",
      target: { label: "https://example.com/health", url: "https://example.com/health" },
      interval_sec: 300,
      timeout_sec: 10,
      public_visible: true,
      latest: { checked_at: null, latency_ms: null, uptime_ratio: null, cpu_percent: null, mem_percent: null, error_text: null },
      visibility: { public: true, show_uptime: true, show_latency: true, show_incidents: true },
      created_at: now - 1800,
      updated_at: now - 1800,
    },
  ];
}

function createMockAlertRules(): ReadonlyArray<AlertRule> {
  const now = Math.floor(Date.now() / 1000);
  return [{
    id: "alert-rule-1",
    backend_id: "default",
    backend_label: "Default backend",
    backend_type: "cloudflare_worker",
    name: "Homepage offline",
    monitor_id: "monitor-http-1",
    condition: "offline",
    params: {},
    channel_ids: ["channel-webhook-1"],
    enabled: true,
    severity: "critical",
    confirm_for_sec: 60,
    repeat_interval_sec: 3600,
    silent_hours: null,
    timezone: "UTC",
    created_at: now - 600,
    updated_at: now - 120,
  }];
}

function createMockNotificationChannels(): ReadonlyArray<NotificationChannel> {
  const now = Math.floor(Date.now() / 1000);
  return [
    {
      id: "channel-webhook-1",
      backend_id: "default",
      backend_label: "Default backend",
      backend_type: "cloudflare_worker",
      name: "Ops webhook",
      type: "webhook",
      enabled: true,
      has_secret: true,
      redacted_label: "https://hooks.example.test/alerts",
      delivery_status: "ok",
      updated_at: now - 120,
    },
    {
      id: "channel-telegram-1",
      backend_id: "default",
      backend_label: "Default backend",
      backend_type: "cloudflare_worker",
      name: "SRE Telegram",
      type: "telegram",
      enabled: true,
      has_secret: true,
      redacted_label: "chat ****7890",
      delivery_status: "untested",
      updated_at: now - 60,
    },
  ];
}

function createMockAlertEvents(): ReadonlyArray<AlertEvent> {
  const now = Math.floor(Date.now() / 1000);
  return [{
    id: "alert-event-1",
    backend_id: "default",
    backend_label: "Default backend",
    backend_type: "cloudflare_worker",
    rule_id: "alert-rule-1",
    monitor_id: "monitor-http-1",
    monitor_name: "Homepage",
    rule_name: "Homepage offline",
    event_type: "firing",
    severity: "critical",
    message: "Homepage is offline",
    notification_status: "pending",
    created_at: now - 60,
  }];
}

function createOverview(): OverviewStats {
  return {
    totalNodes: 2,
    onlineNodes: 1,
    avgUptimeRatio: 93.55,
    avgPing: 18,
  };
}

function createStatistics(): MockApiState["statistics"] {
  const now = Math.floor(Date.now() / 1000);
  const source = {
    backend_id: "default",
    backend_label: "Default backend",
    backend_type: "cloudflare_worker" as const,
  };

  return {
    summary: {
      ...source,
      range: "7d",
      generated_at: now,
      total_monitors: 2,
      online_monitors: 1,
      incident_count: 3,
      total_downtime_sec: 5400,
      avg_latency_ms: 181,
      uptime_ratio: 98.75,
    },
    leaderboards: {
      ...source,
      range: "7d",
      generated_at: now,
      downtime: [{
        monitor_id: "monitor-http-1",
        monitor_name: "Homepage",
        monitor_type: "http",
        value: 5400,
        label: "1h 30m",
        sample_count: 24,
      }],
      slowest: [{
        monitor_id: "monitor-http-1",
        monitor_name: "Homepage",
        monitor_type: "http",
        value: 640,
        label: "640ms",
        sample_count: 24,
      }],
      resource_heavy: [{
        monitor_id: "monitor-agent-1",
        monitor_name: "edge-sfo-1",
        monitor_type: "agent",
        value: 78,
        label: "78%",
        sample_count: 12,
      }],
    },
    trends: {
      ...source,
      range: "7d",
      generated_at: now,
      availability: [
        { date: "2026-05-20", uptime_ratio: 100, down_count: 0, check_count: 24 },
        { date: "2026-05-21", uptime_ratio: 95.83, down_count: 1, check_count: 24 },
      ],
      system_load: [
        { time: new Date((now - 3600) * 1000).toISOString(), cpu_percent: 24, mem_percent: 58, sample_count: 1 },
        { time: new Date(now * 1000).toISOString(), cpu_percent: 31, mem_percent: 62, sample_count: 1 },
      ],
    },
  };
}

function createMetricsByNode(): Readonly<Record<string, ReadonlyArray<ApiMetric>>> {
  const now = Math.floor(Date.now() / 1000);

  return {
    "node-1": [
      {
        id: 1,
        node_id: "node-1",
        timestamp: now - 300,
        cpu_percent: 22,
        mem_percent: 54,
        ping_ms: 21,
        containers: [],
      },
      {
        id: 2,
        node_id: "node-1",
        timestamp: now - 60,
        cpu_percent: 28,
        mem_percent: 59,
        ping_ms: 19,
        containers: [],
      },
    ],
    "node-2": [],
  };
}

function createMockState(): MockApiState {
  return {
    auth: {
      authenticated: false,
      isUiLockEnabled: true,
      password: "test-password",
      accessToken: "test-access-token",
      refreshToken: "test-refresh-token",
    },
    nodes: createMockNodes(),
    monitors: createMockMonitors(),
    notificationChannels: createMockNotificationChannels(),
    alertRules: createMockAlertRules(),
    alertEvents: createMockAlertEvents(),
    agentlessChecks: [],
    overview: createOverview(),
    statistics: createStatistics(),
    metricsByNode: createMetricsByNode(),
    publicStatus: {
      enabled: true,
      private_slug: null,
      show_uptime: true,
      show_latency: false,
      show_incidents: true,
      show_monitor_type: true,
    },
    failSettingsUpdate: false,
  };
}

let mockApiState = createMockState();

export function resetMockApiState(): void {
  mockApiState = createMockState();
}

export function setMockAuthState(overrides: Partial<MockAuthState>): void {
  mockApiState = {
    ...mockApiState,
    auth: {
      ...mockApiState.auth,
      ...overrides,
    },
  };
}

export function setMockNodes(nodes: ReadonlyArray<ApiNode>): void {
  mockApiState = {
    ...mockApiState,
    nodes,
  };
}

export function setMockMonitors(monitors: ReadonlyArray<Monitor>): void {
  mockApiState = {
    ...mockApiState,
    monitors,
  };
}

export function setMockAlertRules(alertRules: ReadonlyArray<AlertRule>): void {
  mockApiState = {
    ...mockApiState,
    alertRules,
  };
}

export function setMockNotificationChannels(notificationChannels: ReadonlyArray<NotificationChannel>): void {
  mockApiState = {
    ...mockApiState,
    notificationChannels,
  };
}

export function setMockOverview(overview: OverviewStats): void {
  mockApiState = {
    ...mockApiState,
    overview,
  };
}

export function setMockStatistics(statistics: Partial<MockApiState["statistics"]>): void {
  mockApiState = {
    ...mockApiState,
    statistics: {
      ...mockApiState.statistics,
      ...statistics,
    },
  };
}

export function setMockMetrics(nodeId: string, metrics: ReadonlyArray<ApiMetric>): void {
  mockApiState = {
    ...mockApiState,
    metricsByNode: {
      ...mockApiState.metricsByNode,
      [nodeId]: metrics,
    },
  };
}

export function setFailSettingsUpdate(failSettingsUpdate: boolean): void {
  mockApiState = {
    ...mockApiState,
    failSettingsUpdate,
  };
}

function authStatusResponse() {
  return HttpResponse.json({
    authenticated: mockApiState.auth.authenticated,
    is_ui_lock_enabled: mockApiState.auth.isUiLockEnabled,
    has_refresh_cookie: mockApiState.auth.authenticated,
  });
}

export const handlers = [
  http.get("/api/auth/status", () => authStatusResponse()),
  http.post("/api/auth/status", () => authStatusResponse()),
  http.post("/api/auth/login", async ({ request }) => {
    const body = (await request.json()) as { password?: string };

    if (body.password === mockApiState.auth.password) {
      mockApiState = {
        ...mockApiState,
        auth: {
          ...mockApiState.auth,
          authenticated: true,
        },
      };

      return HttpResponse.json({
        access_token: mockApiState.auth.accessToken,
        refresh_token: mockApiState.auth.refreshToken,
      });
    }

    return HttpResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }),
  http.post("/api/auth/refresh", () => {
    if (!mockApiState.auth.authenticated) {
      return HttpResponse.json({ error: "No active session" }, { status: 401 });
    }

    return HttpResponse.json({
      access_token: mockApiState.auth.accessToken,
      refresh_token: mockApiState.auth.refreshToken,
    });
  }),
  http.post("/api/auth/logout", () => {
    mockApiState = {
      ...mockApiState,
      auth: {
        ...mockApiState.auth,
        authenticated: false,
      },
    };

    return HttpResponse.json({ success: true });
  }),
  http.get("/api/nodes", () => {
    return HttpResponse.json({ data: mockApiState.nodes });
  }),
  http.put("/api/nodes/:nodeId", async ({ params, request }) => {
    const nodeId = typeof params.nodeId === "string" ? params.nodeId : "";
    const body = (await request.json()) as Partial<ApiNode>;
    const nodes = mockApiState.nodes.map((node) => node.id === nodeId ? { ...node, ...body } : node);
    const updated = nodes.find((node) => node.id === nodeId);
    mockApiState = { ...mockApiState, nodes };
    return updated ? HttpResponse.json({ data: updated }) : HttpResponse.json({ error: "Node not found" }, { status: 404 });
  }),
  http.delete("/api/nodes/:nodeId", ({ params }) => {
    const nodeId = typeof params.nodeId === "string" ? params.nodeId : "";
    mockApiState = { ...mockApiState, nodes: mockApiState.nodes.filter((node) => node.id !== nodeId) };
    return HttpResponse.json({ data: { id: nodeId, archived_at: Math.floor(Date.now() / 1000) } });
  }),
  http.get("/api/agentless", () => {
    return HttpResponse.json({ data: mockApiState.agentlessChecks });
  }),
  http.get("/api/v1/monitors", () => {
    return HttpResponse.json({ data: mockApiState.monitors });
  }),
  http.get("/api/v1/alerts/rules", () => {
    return HttpResponse.json({ data: mockApiState.alertRules });
  }),
  http.post("/api/v1/alerts/rules", async ({ request }) => {
    const body = (await request.json()) as Partial<AlertRule>;
    const now = Math.floor(Date.now() / 1000);
    const rule: AlertRule = {
      id: `alert-rule-${mockApiState.alertRules.length + 1}`,
      backend_id: "default",
      backend_label: "Default backend",
      backend_type: "cloudflare_worker",
      name: body.name ?? "Alert rule",
      monitor_id: body.monitor_id ?? "monitor-http-1",
      condition: body.condition ?? "offline",
      params: body.params ?? {},
      channel_ids: body.channel_ids ?? ["channel-webhook-1"],
      enabled: body.enabled ?? true,
      severity: body.severity ?? "warning",
      confirm_for_sec: body.confirm_for_sec ?? 0,
      repeat_interval_sec: body.repeat_interval_sec ?? 3600,
      silent_hours: body.silent_hours ?? null,
      timezone: body.timezone ?? "UTC",
      created_at: now,
      updated_at: now,
    };
    mockApiState = { ...mockApiState, alertRules: [rule, ...mockApiState.alertRules] };
    return HttpResponse.json({ data: rule });
  }),
  http.put("/api/v1/alerts/rules/:ruleId", async ({ params, request }) => {
    const ruleId = typeof params.ruleId === "string" ? params.ruleId : "";
    const body = (await request.json()) as Partial<AlertRule>;
    const rules = mockApiState.alertRules.map((rule) => rule.id === ruleId ? { ...rule, ...body } : rule);
    const updated = rules.find((rule) => rule.id === ruleId);
    mockApiState = { ...mockApiState, alertRules: rules };
    return updated ? HttpResponse.json({ data: updated }) : HttpResponse.json({ error: "Rule not found" }, { status: 404 });
  }),
  http.post("/api/v1/alerts/rules/:ruleId/enable", ({ params }) => {
    const ruleId = typeof params.ruleId === "string" ? params.ruleId : "";
    const rules = mockApiState.alertRules.map((rule) => rule.id === ruleId ? { ...rule, enabled: true } : rule);
    const updated = rules.find((rule) => rule.id === ruleId);
    mockApiState = { ...mockApiState, alertRules: rules };
    return updated ? HttpResponse.json({ data: updated }) : HttpResponse.json({ error: "Rule not found" }, { status: 404 });
  }),
  http.post("/api/v1/alerts/rules/:ruleId/disable", ({ params }) => {
    const ruleId = typeof params.ruleId === "string" ? params.ruleId : "";
    const rules = mockApiState.alertRules.map((rule) => rule.id === ruleId ? { ...rule, enabled: false } : rule);
    const updated = rules.find((rule) => rule.id === ruleId);
    mockApiState = { ...mockApiState, alertRules: rules };
    return updated ? HttpResponse.json({ data: updated }) : HttpResponse.json({ error: "Rule not found" }, { status: 404 });
  }),
  http.delete("/api/v1/alerts/rules/:ruleId", ({ params }) => {
    const ruleId = typeof params.ruleId === "string" ? params.ruleId : "";
    const deleted = mockApiState.alertRules.find((rule) => rule.id === ruleId);
    mockApiState = { ...mockApiState, alertRules: mockApiState.alertRules.filter((rule) => rule.id !== ruleId) };
    return deleted ? HttpResponse.json({ data: deleted }) : HttpResponse.json({ error: "Rule not found" }, { status: 404 });
  }),
  http.get("/api/v1/alerts/history", () => {
    return HttpResponse.json({ data: mockApiState.alertEvents });
  }),
  http.get("/api/v1/statistics/summary", () => {
    return HttpResponse.json({ data: mockApiState.statistics.summary });
  }),
  http.get("/api/v1/statistics/leaderboards", () => {
    return HttpResponse.json({ data: mockApiState.statistics.leaderboards });
  }),
  http.get("/api/v1/statistics/trends", () => {
    return HttpResponse.json({ data: mockApiState.statistics.trends });
  }),
  http.get("/api/v1/notifications/channels", () => {
    return HttpResponse.json({ data: mockApiState.notificationChannels });
  }),
  http.post("/api/v1/notifications/channels", async ({ request }) => {
    const body = (await request.json()) as {
      name?: string;
      type?: NotificationChannel["type"];
      enabled?: boolean;
      config?: Record<string, unknown>;
    };
    const now = Math.floor(Date.now() / 1000);
    const channel: NotificationChannel = {
      id: `channel-${body.type ?? "webhook"}-${mockApiState.notificationChannels.length + 1}`,
      backend_id: "default",
      backend_label: "Default backend",
      backend_type: "cloudflare_worker",
      name: body.name ?? "Notification channel",
      type: body.type ?? "webhook",
      enabled: body.type === "email" ? false : body.enabled ?? true,
      has_secret: body.type === "telegram" || Object.keys((body.config?.headers as Record<string, string> | undefined) ?? {}).length > 0,
      redacted_label: body.type === "telegram"
        ? "chat ****7890"
        : body.type === "email"
          ? "Coming soon"
          : String(body.config?.url ?? "https://hooks.example.test/alerts"),
      delivery_status: body.type === "email" ? "disabled" : "untested",
      updated_at: now,
    };
    mockApiState = { ...mockApiState, notificationChannels: [channel, ...mockApiState.notificationChannels] };
    return HttpResponse.json({ data: channel });
  }),
  http.put("/api/v1/notifications/channels/:channelId", async ({ params, request }) => {
    const channelId = typeof params.channelId === "string" ? params.channelId : "";
    const body = (await request.json()) as Partial<NotificationChannel>;
    const channels = mockApiState.notificationChannels.map((channel) => channel.id === channelId ? { ...channel, ...body } : channel);
    const updated = channels.find((channel) => channel.id === channelId);
    mockApiState = { ...mockApiState, notificationChannels: channels };
    return updated ? HttpResponse.json({ data: updated }) : HttpResponse.json({ error: "Channel not found" }, { status: 404 });
  }),
  http.post("/api/v1/notifications/channels/:channelId/test", ({ params }) => {
    const channelId = typeof params.channelId === "string" ? params.channelId : "";
    const channels = mockApiState.notificationChannels.map((channel) => channel.id === channelId ? { ...channel, delivery_status: "ok" as const } : channel);
    const updated = channels.find((channel) => channel.id === channelId);
    mockApiState = { ...mockApiState, notificationChannels: channels };
    return updated ? HttpResponse.json({ data: updated }) : HttpResponse.json({ error: "Channel not found" }, { status: 404 });
  }),
  http.delete("/api/v1/notifications/channels/:channelId", ({ params }) => {
    const channelId = typeof params.channelId === "string" ? params.channelId : "";
    const channel = mockApiState.notificationChannels.find((item) => item.id === channelId);
    mockApiState = { ...mockApiState, notificationChannels: mockApiState.notificationChannels.filter((item) => item.id !== channelId) };
    return channel ? HttpResponse.json({ data: { ...channel, enabled: false, delivery_status: "disabled" } }) : HttpResponse.json({ error: "Channel not found" }, { status: 404 });
  }),
  http.get("/api/public/status", () => {
    if (!mockApiState.publicStatus.enabled) {
      return HttpResponse.json({ error: { code: "public_status_unavailable", message: "Public Status is not available" } }, { status: 404 });
    }
    return HttpResponse.json({
      status: "online",
      message: "All public systems are operational.",
      updated_at: Math.floor(Date.now() / 1000),
      monitors: mockApiState.monitors
        .filter((monitor) => monitor.public_visible)
        .map((monitor) => ({
          backend_id: monitor.backend_id,
          backend_label: monitor.backend_label,
          backend_type: monitor.backend_type,
          id: monitor.id,
          name: monitor.name,
          ...(mockApiState.publicStatus.show_monitor_type ? { type: monitor.type } : {}),
          status: monitor.status,
          target_label: monitor.type === "agent" ? "Agent probe" : monitor.type === "tcp" ? "TCP endpoint" : "example.com",
          ...(mockApiState.publicStatus.show_latency ? { latency_ms: monitor.latest.latency_ms } : {}),
          ...(mockApiState.publicStatus.show_uptime ? { uptime_ratio: monitor.latest.uptime_ratio } : {}),
          updated_at: monitor.updated_at,
        })),
      incidents: mockApiState.publicStatus.show_incidents ? [] : [],
    });
  }),
  http.post("/api/v1/monitors", async ({ request }) => {
    const body = (await request.json()) as { name?: string; type?: MonitorType; interval_sec?: number; timeout_sec?: number; config?: Record<string, unknown> };
    const type = body.type ?? "http";
    const target = type === "http"
      ? { label: String(body.config?.url ?? "https://example.com"), url: String(body.config?.url ?? "https://example.com") }
      : type === "tcp"
        ? { label: `${String(body.config?.host ?? "db.example.com")}:${Number(body.config?.port ?? 5432)}`, host: String(body.config?.host ?? "db.example.com"), port: Number(body.config?.port ?? 5432) }
        : { label: "Agent probe" };
    const monitor: Monitor = {
      id: `monitor-${type}-${mockApiState.monitors.length + 1}`,
      backend_id: "default",
      backend_label: "Default backend",
      backend_type: "cloudflare_worker",
      name: body.name ?? "Monitor",
      type,
      status: "unknown",
      target,
      interval_sec: body.interval_sec ?? 300,
      timeout_sec: body.timeout_sec ?? 10,
      public_visible: true,
      latest: { checked_at: null, latency_ms: null, uptime_ratio: null, cpu_percent: null, mem_percent: null, error_text: null },
      visibility: { public: true, show_uptime: true, show_latency: true, show_incidents: true },
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
    };
    mockApiState = { ...mockApiState, monitors: [monitor, ...mockApiState.monitors] };
    return HttpResponse.json({ data: monitor });
  }),
  http.put("/api/v1/monitors/:monitorId", async ({ params, request }) => {
    const monitorId = typeof params.monitorId === "string" ? params.monitorId : "";
    const body = (await request.json()) as Partial<Monitor>;
    const monitors = mockApiState.monitors.map((monitor) => monitor.id === monitorId ? { ...monitor, ...body } : monitor);
    const updated = monitors.find((monitor) => monitor.id === monitorId);
    mockApiState = { ...mockApiState, monitors };
    return updated ? HttpResponse.json({ data: updated }) : HttpResponse.json({ error: "Monitor not found" }, { status: 404 });
  }),
  http.post("/api/v1/monitors/:monitorId/pause", ({ params }) => {
    const monitorId = typeof params.monitorId === "string" ? params.monitorId : "";
    const monitors = mockApiState.monitors.map((monitor) => monitor.id === monitorId ? { ...monitor, status: "paused" as const } : monitor);
    const updated = monitors.find((monitor) => monitor.id === monitorId);
    mockApiState = { ...mockApiState, monitors };
    return updated ? HttpResponse.json({ data: updated }) : HttpResponse.json({ error: "Monitor not found" }, { status: 404 });
  }),
  http.post("/api/v1/monitors/:monitorId/resume", ({ params }) => {
    const monitorId = typeof params.monitorId === "string" ? params.monitorId : "";
    const monitors = mockApiState.monitors.map((monitor) => monitor.id === monitorId ? { ...monitor, status: "unknown" as const } : monitor);
    const updated = monitors.find((monitor) => monitor.id === monitorId);
    mockApiState = { ...mockApiState, monitors };
    return updated ? HttpResponse.json({ data: updated }) : HttpResponse.json({ error: "Monitor not found" }, { status: 404 });
  }),
  http.delete("/api/v1/monitors/:monitorId", ({ params }) => {
    const monitorId = typeof params.monitorId === "string" ? params.monitorId : "";
    const monitor = mockApiState.monitors.find((item) => item.id === monitorId);
    mockApiState = { ...mockApiState, monitors: mockApiState.monitors.filter((item) => item.id !== monitorId) };
    return monitor ? HttpResponse.json({ data: { ...monitor, status: "paused" } }) : HttpResponse.json({ error: "Monitor not found" }, { status: 404 });
  }),
  http.post("/api/agentless/http", async ({ request }) => {
    const body = (await request.json()) as { name?: string; url?: string; interval?: number; timeout?: number; expected_status?: number };
    const check: AgentlessCheck = {
      id: `agentless-http-${mockApiState.agentlessChecks.length + 1}`,
      name: body.name ?? "HTTP check",
      type: "agentless_http",
      status: "paused",
      target: body.url ?? "https://example.com/health",
      interval: body.interval ?? 300,
      timeout: body.timeout ?? 10,
      expected_status: body.expected_status ?? 200,
      latest_result: null,
    };
    mockApiState = { ...mockApiState, agentlessChecks: [...mockApiState.agentlessChecks, check] };
    return HttpResponse.json({ data: check });
  }),
  http.post("/api/agentless/tcp", async ({ request }) => {
    const body = (await request.json()) as { name?: string; host?: string; port?: number; interval?: number; timeout?: number };
    const check: AgentlessCheck = {
      id: `agentless-tcp-${mockApiState.agentlessChecks.length + 1}`,
      name: body.name ?? "TCP check",
      type: "agentless_tcp",
      status: "paused",
      target: `${body.host ?? "db.example.com"}:${body.port ?? 5432}`,
      interval: body.interval ?? 300,
      timeout: body.timeout ?? 10,
      latest_result: null,
    };
    mockApiState = { ...mockApiState, agentlessChecks: [...mockApiState.agentlessChecks, check] };
    return HttpResponse.json({ data: check });
  }),
  http.post("/api/nodes/probe-config", async ({ request }) => {
    const body = (await request.json()) as { name?: string; platform?: string };
    const nodeName = body.name?.trim();

    if (!nodeName) {
      return HttpResponse.json({ error: "Name is required" }, { status: 400 });
    }

    return HttpResponse.json({
      data: {
        node_id: "node-generated-1",
        node_name: nodeName,
        node_secret: "node-secret-generated",
        probe_push_url: "https://uptime-lofi-probe.example.workers.dev/api/push",
        install_command: "curl -fsSL 'https://github.com/example/uptime-lofi/releases/download/probe-latest/install-probe.sh' | UPTIME_PLATFORM='linux/amd64' UPTIME_PROBE_PUSH_URL='https://uptime-lofi-probe.example.workers.dev/api/push' UPTIME_NODE_ID='node-generated-1' UPTIME_NODE_SECRET='node-secret-generated' UPTIME_RELEASE_REPO='example/uptime-lofi' UPTIME_RELEASE_TAG='probe-latest' bash",
        install_script_url: "https://github.com/example/uptime-lofi/releases/download/probe-latest/install-probe.sh",
        config_yaml: "api_url: https://uptime-lofi-probe.example.workers.dev/api/push\nnode_id: node-generated-1\npsk: node-secret-generated\nenable_docker: true\n",
        downloads: {
          linux_amd64: "https://github.com/example/uptime-lofi/releases/latest/download/probe-linux-amd64.tar.gz",
          linux_arm64: "https://github.com/example/uptime-lofi/releases/latest/download/probe-linux-arm64.tar.gz",
          darwin_amd64: "https://github.com/example/uptime-lofi/releases/latest/download/probe-darwin-amd64.tar.gz",
          darwin_arm64: "https://github.com/example/uptime-lofi/releases/latest/download/probe-darwin-arm64.tar.gz",
        },
      },
    });
  }),
  http.get("/api/nodes/:nodeId/metrics", ({ params }) => {
    const nodeId = typeof params.nodeId === "string" ? params.nodeId : "";
    return HttpResponse.json({ data: mockApiState.metricsByNode[nodeId] ?? [] });
  }),
  http.get("/api/stats/overview", () => {
    return HttpResponse.json({ data: mockApiState.overview });
  }),
  http.get("/api/settings", () => {
    return HttpResponse.json({
      data: {
        is_ui_lock_enabled: mockApiState.auth.isUiLockEnabled,
        public_status: mockApiState.publicStatus,
      },
    });
  }),
  http.post("/api/settings/security", async ({ request }) => {
    if (mockApiState.failSettingsUpdate) {
      return HttpResponse.json({ error: "Failed to save settings" }, { status: 500 });
    }

    const body = (await request.json()) as { enabled?: boolean; password?: string };
    const nextEnabled = Boolean(body.enabled);
    const nextPassword = nextEnabled && body.password?.trim()
      ? body.password.trim()
      : mockApiState.auth.password;

    mockApiState = {
      ...mockApiState,
      auth: {
        ...mockApiState.auth,
        isUiLockEnabled: nextEnabled,
        password: nextPassword,
      },
    };

    return HttpResponse.json({ success: true });
  }),
  http.post("/api/settings/public-status", async ({ request }) => {
    const body = (await request.json()) as PublicStatusSettings & { monitors?: ReadonlyArray<{ id: string; public_visible: boolean }> };
    mockApiState = {
      ...mockApiState,
      publicStatus: {
        enabled: body.enabled,
        private_slug: body.private_slug,
        show_uptime: body.show_uptime,
        show_latency: body.show_latency,
        show_incidents: body.show_incidents,
        show_monitor_type: body.show_monitor_type,
      },
      monitors: mockApiState.monitors.map((monitor) => {
        const visibility = body.monitors?.find((item) => item.id === monitor.id);
        return visibility ? { ...monitor, public_visible: visibility.public_visible } : monitor;
      }),
    };
    return HttpResponse.json({ data: { public_status: mockApiState.publicStatus } });
  }),
];
