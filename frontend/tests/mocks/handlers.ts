import { http, HttpResponse } from "msw";
import type { ApiMetric, ApiNode, OverviewStats } from "../../src/api/types";

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
  readonly overview: OverviewStats;
  readonly metricsByNode: Readonly<Record<string, ReadonlyArray<ApiMetric>>>;
  readonly failSettingsUpdate: boolean;
}

function createMockNodes(): ReadonlyArray<ApiNode> {
  const now = Math.floor(Date.now() / 1000);

  return [
    {
      id: "node-1",
      name: "edge-sfo-1",
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

function createOverview(): OverviewStats {
  return {
    totalNodes: 2,
    onlineNodes: 1,
    avgUptimeRatio: 93.55,
    avgPing: 18,
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
    overview: createOverview(),
    metricsByNode: createMetricsByNode(),
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

export function setMockOverview(overview: OverviewStats): void {
  mockApiState = {
    ...mockApiState,
    overview,
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
];
