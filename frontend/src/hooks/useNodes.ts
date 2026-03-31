// ═══════════════════════════════════════════
// useNodes — Fetches /api/nodes with polling
// ═══════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react';
import { api, ApiClientError } from '../api/client';
import type { ApiNode } from '../api/types';

const POLL_INTERVAL_MS = 30_000;

interface UseNodesResult {
  readonly nodes: ReadonlyArray<ApiNode>;
  readonly loading: boolean;
  readonly error: string | null;
  readonly refetch: () => void;
}

export function useNodes(isAuthenticated: boolean): UseNodesResult {
  const [nodes, setNodes] = useState<ReadonlyArray<ApiNode>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchNodes = useCallback(async (isInitial = false) => {
    if (!isAuthenticated) return;
    if (isInitial) setLoading(true);
    try {
      const res = await api.getNodes();
      if (mountedRef.current) {
        setNodes(res.data);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof ApiClientError ? err.message : 'Failed to load nodes');
      }
    } finally {
      if (mountedRef.current && isInitial) setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    mountedRef.current = true;
    fetchNodes(true);
    const id = setInterval(() => fetchNodes(false), POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [fetchNodes, isAuthenticated]);

  return { nodes, loading, error, refetch: () => fetchNodes(true) };
}
