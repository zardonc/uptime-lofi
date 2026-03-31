// ═══════════════════════════════════════════
// useOverview — Fetches /api/stats/overview
// ═══════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react';
import { api, ApiClientError } from '../api/client';
import type { OverviewStats } from '../api/types';

const POLL_INTERVAL_MS = 30_000;

const DEFAULT_STATS: OverviewStats = {
  totalNodes: 0,
  onlineNodes: 0,
  avgUptimeRatio: 100,
  avgPing: 0,
};

interface UseOverviewResult {
  readonly stats: OverviewStats;
  readonly loading: boolean;
  readonly error: string | null;
  readonly refetch: () => void;
}

export function useOverview(isAuthenticated: boolean): UseOverviewResult {
  const [stats, setStats] = useState<OverviewStats>(DEFAULT_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchOverview = useCallback(async (isInitial = false) => {
    if (!isAuthenticated) return;
    if (isInitial) setLoading(true);
    try {
      const res = await api.getOverview();
      if (mountedRef.current) {
        setStats(res.data);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof ApiClientError ? err.message : 'Failed to load overview');
      }
    } finally {
      if (mountedRef.current && isInitial) setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    mountedRef.current = true;
    fetchOverview(true);
    const id = setInterval(() => fetchOverview(false), POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [fetchOverview, isAuthenticated]);

  return { stats, loading, error, refetch: () => fetchOverview(true) };
}
