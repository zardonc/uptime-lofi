// ═══════════════════════════════════════════
// API Client — Uptime LoFi Dashboard
// JWT-aware fetch wrapper with auto-refresh
// ═══════════════════════════════════════════

import type {
  LoginResponse,
  ApiNode,
  ApiMetric,
  OverviewStats,
  ProbeConfigRequest,
  ProbeConfigResponse,
} from './types';

const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const BASE = '/api';

// ── Token store (memory-only, never persisted) ──
let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

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
    throw new ApiClientError(401, 'Session expired');
  }

  if (!res.ok) throw new ApiClientError(res.status, await safeText(res));
  return res.json() as Promise<T>;
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
      accessToken = body.access_token;
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
    const json = await res.json();
    return (json as Record<string, string>).error ?? JSON.stringify(json);
  } catch {
    return res.statusText;
  }
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
    apiFetch<{ is_ui_lock_enabled: boolean }>('/auth/status', { auth: false }),

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
  getOverview: () => apiFetch<{ data: OverviewStats }>('/stats/overview'),
  getMetrics: (nodeId: string, hours = 24) =>
    apiFetch<{ data: ApiMetric[] }>(`/nodes/${nodeId}/metrics?hours=${hours}`),

  updateSecuritySettings: (payload: { enabled: boolean; password?: string }) =>
    apiFetch<{ success: boolean }>('/settings/security', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  createProbeConfig: (payload: ProbeConfigRequest) =>
    apiFetch<ProbeConfigResponse>('/nodes/probe-config', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
} as const;
