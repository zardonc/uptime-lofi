import { useCallback, useEffect, useState } from 'react';
import { api, ApiClientError } from '../api/client';
import type { Monitor } from '../api/types';

export function useMonitors(enabled = true) {
  const [monitors, setMonitors] = useState<ReadonlyArray<Monitor>>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const response = await api.getMonitors();
      setMonitors(response.data);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not load monitors.');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { monitors, setMonitors, loading, error, refetch };
}
