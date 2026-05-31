// ═══════════════════════════════════════════
// API Client — Uptime LoFi Dashboard
// JWT-aware fetch wrapper with auto-refresh
// ═══════════════════════════════════════════

import type {
  LoginResponse,
  AuthStatusResponse,
  ApiResponse,
  ApiNode,
  ApiMetric,
  OverviewStats,
  ProbeConfigRequest,
  ProbeConfigResponse,
  UpdateNodeRequest,
  DeleteNodeResponse,
  AgentlessCheck,
  CreateHttpCheckRequest,
  CreateTcpCheckRequest,
  CreateMonitorRequest,
  AlertEvent,
  AlertRule,
  CreateAlertRuleRequest,
  CreateNotificationChannelRequest,
  Monitor,
  NotificationChannel,
  PublicStatusResponse,
  PublicStatusSettings,
  SettingsResponse,
  StatisticsLeaderboards,
  StatisticsRange,
  StatisticsSummary,
  StatisticsTrends,
  UpdateAlertRuleRequest,
  UpdateMonitorRequest,
  UpdateNotificationChannelRequest,
} from './types';

const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const BASE = '/api';

// ── Token store (memory-only, never persisted) ──
let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;
const ACCESS_TOKEN_REFRESH_SKEW_SECONDS = 60;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

// ── Core fetch helper ──
async function apiFetch<T>(
  path: string,
  { auth = true, ...init }: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);

  if (auth && accessToken && accessTokenExpiresSoon(accessToken)) {
    const refreshed = await tryRefresh();
    if (!refreshed) {
      notifySessionExpired();
      throw new ApiClientError(401, 'Session expired');
    }
  }

  if (auth && accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${API_BASE_URL}${BASE}${path}`, { ...init, headers, credentials: 'include' });

  if (res.status === 401 && auth) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers.set('Authorization', `Bearer ${refreshed}`);
      const retry = await fetch(`${API_BASE_URL}${BASE}${path}`, { ...init, headers, credentials: 'include' });
      if (!retry.ok) throw new ApiClientError(retry.status, await safeText(retry));
      return retry.json() as Promise<T>;
    }
    notifySessionExpired();
    throw new ApiClientError(401, 'Session expired');
  }

  if (!res.ok) throw new ApiClientError(res.status, await safeText(res));
  return res.json() as Promise<T>;
}

function accessTokenExpiresSoon(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (typeof payload?.exp !== 'number') return false;
  return payload.exp <= Math.floor(Date.now() / 1000) + ACCESS_TOKEN_REFRESH_SKEW_SECONDS;
}

function decodeJwtPayload(token: string): { readonly exp?: unknown } | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const padded = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    return JSON.parse(atob(padded)) as { readonly exp?: unknown };
  } catch {
    return null;
  }
}

function notifySessionExpired(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('uptime-lofi:session-expired'));
  }
}

// ── Refresh token rotation (coalesced) ──
async function tryRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}${BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        accessToken = null;
        return null;
      }
      const body = (await res.json()) as LoginResponse;
      accessToken = body.access_token ?? null;
      return accessToken;
    } catch {
      accessToken = null;
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function safeText(res: Response): Promise<string> {
  try {
    const json = await res.json() as unknown;
    return errorMessage(json) ?? JSON.stringify(json);
  } catch {
    return res.statusText;
  }
}

function errorMessage(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('error' in value)) return null;

  const error = (value as { readonly error?: unknown }).error;
  if (typeof error === 'string') return error;
  if (!error || typeof error !== 'object') return null;

  const message = (error as { readonly message?: unknown }).message;
  return typeof message === 'string' && message.trim() ? message : null;
}

// ── Error class ──
export class ApiClientError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
  }
}

// ── Public API methods ──
export const api = {
  getAuthStatus: () =>
    apiFetch<AuthStatusResponse>('/auth/status', { auth: false }),

  getSettings: () => apiFetch<ApiResponse<SettingsResponse>>('/v1/settings'),

  login: (password: string) =>
    apiFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
      auth: false,
    }),

  refreshSession: () =>
    apiFetch<LoginResponse>('/auth/refresh', {
      method: 'POST',
      auth: false,
    }),

  logout: () =>
    apiFetch<{ success: boolean }>('/auth/logout', {
      method: 'POST',
    }),

  getNodes: () => apiFetch<{ data: ApiNode[] }>('/nodes'),
  updateNode: (id: string, payload: UpdateNodeRequest) =>
    apiFetch<ApiResponse<ApiNode>>(`/nodes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteNode: (id: string) =>
    apiFetch<ApiResponse<DeleteNodeResponse>>(`/nodes/${id}`, {
      method: 'DELETE',
    }),
  getOverview: () => apiFetch<{ data: OverviewStats }>('/stats/overview'),
  getMetrics: (nodeId: string, hours = 24) =>
    apiFetch<{ data: ApiMetric[] }>(`/nodes/${nodeId}/metrics?hours=${hours}`),
  getAgentlessChecks: () => apiFetch<ApiResponse<AgentlessCheck[]>>('/agentless'),
  getMonitors: () => apiFetch<ApiResponse<Monitor[]>>('/v1/monitors'),
  createMonitor: (payload: CreateMonitorRequest) =>
    apiFetch<ApiResponse<Monitor>>('/v1/monitors', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateMonitor: (id: string, payload: UpdateMonitorRequest) =>
    apiFetch<ApiResponse<Monitor>>(`/v1/monitors/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  pauseMonitor: (id: string) =>
    apiFetch<ApiResponse<Monitor>>(`/v1/monitors/${id}/pause`, {
      method: 'POST',
    }),
  resumeMonitor: (id: string) =>
    apiFetch<ApiResponse<Monitor>>(`/v1/monitors/${id}/resume`, {
      method: 'POST',
    }),
  deleteMonitor: (id: string) =>
    apiFetch<ApiResponse<Monitor>>(`/v1/monitors/${id}`, {
      method: 'DELETE',
    }),
  getAlertRules: () => apiFetch<ApiResponse<AlertRule[]>>('/v1/alerts/rules'),
  createAlertRule: (payload: CreateAlertRuleRequest) =>
    apiFetch<ApiResponse<AlertRule>>('/v1/alerts/rules', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateAlertRule: (id: string, payload: UpdateAlertRuleRequest) =>
    apiFetch<ApiResponse<AlertRule>>(`/v1/alerts/rules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  enableAlertRule: (id: string) =>
    apiFetch<ApiResponse<AlertRule>>(`/v1/alerts/rules/${id}/enable`, {
      method: 'POST',
    }),
  disableAlertRule: (id: string) =>
    apiFetch<ApiResponse<AlertRule>>(`/v1/alerts/rules/${id}/disable`, {
      method: 'POST',
    }),
  deleteAlertRule: (id: string) =>
    apiFetch<ApiResponse<AlertRule>>(`/v1/alerts/rules/${id}`, {
      method: 'DELETE',
    }),
  getAlertHistory: () => apiFetch<ApiResponse<AlertEvent[]>>('/v1/alerts/history'),
  getStatisticsSummary: (range: StatisticsRange) =>
    apiFetch<ApiResponse<StatisticsSummary>>(`/v1/statistics/summary?range=${encodeURIComponent(range)}`),
  getStatisticsLeaderboards: (range: StatisticsRange) =>
    apiFetch<ApiResponse<StatisticsLeaderboards>>(`/v1/statistics/leaderboards?range=${encodeURIComponent(range)}`),
  getStatisticsTrends: (range: StatisticsRange) =>
    apiFetch<ApiResponse<StatisticsTrends>>(`/v1/statistics/trends?range=${encodeURIComponent(range)}`),
  getNotificationChannels: () => apiFetch<ApiResponse<NotificationChannel[]>>('/v1/notifications/channels'),
  createNotificationChannel: (payload: CreateNotificationChannelRequest) =>
    apiFetch<ApiResponse<NotificationChannel>>('/v1/notifications/channels', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateNotificationChannel: (id: string, payload: UpdateNotificationChannelRequest) =>
    apiFetch<ApiResponse<NotificationChannel>>(`/v1/notifications/channels/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteNotificationChannel: (id: string) =>
    apiFetch<ApiResponse<NotificationChannel>>(`/v1/notifications/channels/${id}`, {
      method: 'DELETE',
    }),
  testNotificationChannel: (id: string) =>
    apiFetch<ApiResponse<NotificationChannel>>(`/v1/notifications/channels/${id}/test`, {
      method: 'POST',
    }),
  createHttpCheck: (payload: CreateHttpCheckRequest) =>
    apiFetch<ApiResponse<AgentlessCheck>>('/agentless/http', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  createTcpCheck: (payload: CreateTcpCheckRequest) =>
    apiFetch<ApiResponse<AgentlessCheck>>('/agentless/tcp', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateSecuritySettings: (payload: { enabled: boolean; password?: string }) =>
    apiFetch<{ success: boolean }>('/v1/settings/security', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updatePublicStatusSettings: (payload: PublicStatusSettings & { readonly monitors?: ReadonlyArray<{ readonly id: string; readonly public_visible: boolean }> }) =>
    apiFetch<ApiResponse<{ public_status: PublicStatusSettings }>>('/v1/settings/public-status', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getPublicStatus: (slug?: string | null) => {
    const query = slug ? `?slug=${encodeURIComponent(slug)}` : '';
    return apiFetch<PublicStatusResponse>(`/public/status${query}`, { auth: false });
  },

  createProbeConfig: (payload: ProbeConfigRequest) =>
    apiFetch<ProbeConfigResponse>('/nodes/probe-config', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
} as const;
