// ═══════════════════════════════════════════
// useMetrics — Fetches /api/nodes/:id/metrics
// ═══════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react';
import { api, ApiClientError } from '../api/client';
import type { ApiMetric } from '../api/types';

const POLL_INTERVAL_MS = 30_000;

export interface TrendPoint {
  readonly time: string;
  readonly cpu: number;
  readonly mem: number;
  readonly ping: number;
}

interface UseMetricsResult {
  readonly trendData: ReadonlyArray<TrendPoint>;
  readonly loading: boolean;
  readonly error: string | null;
}

function toTrendPoints(metrics: ReadonlyArray<ApiMetric>): ReadonlyArray<TrendPoint> {
  return metrics.map((m) => {
    const d = new Date(m.timestamp * 1000);
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    return {
      time: `${hh}:${mm}`,
      cpu: m.cpu_percent ?? 0,
      mem: m.mem_percent ?? 0,
      ping: m.ping_ms ?? 0,
    };
  });
}

export function useMetrics(nodeId: string | null, hours = 24, isAuthenticated = false): UseMetricsResult {
  const [trendData, setTrendData] = useState<ReadonlyArray<TrendPoint>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchMetrics = useCallback(async (isInitial = false) => {
    if (!nodeId || !isAuthenticated) return;
    if (isInitial) setLoading(true);
    try {
      const res = await api.getMetrics(nodeId, hours);
      if (mountedRef.current) {
        setTrendData(toTrendPoints(res.data));
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof ApiClientError ? err.message : 'Failed to load metrics');
      }
    } finally {
      if (mountedRef.current && isInitial) setLoading(false);
    }
  }, [nodeId, hours, isAuthenticated]);

  useEffect(() => {
    if (!nodeId) {
      setTrendData([]);
      setLoading(false);
      return;
    }

    mountedRef.current = true;
    fetchMetrics(true);
    const id = setInterval(() => fetchMetrics(false), POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [fetchMetrics, nodeId, isAuthenticated]);

  return { trendData, loading, error };
}
