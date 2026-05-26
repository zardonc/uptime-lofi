import { useEffect, useMemo, useState } from 'react';
import { Gauge } from 'lucide-react';
import { api, ApiClientError } from '../api/client';
import type { MonitorStatus, PublicMonitor, PublicStatusResponse } from '../api/types';
import { StatusBadge } from './StatusBadge';

const typeLabels = {
  agent: 'Agent Probe',
  http: 'HTTP Check',
  tcp: 'TCP Check',
} as const;

export function PublicStatus() {
  const [data, setData] = useState<PublicStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const slug = useMemo(() => new URLSearchParams(window.location.search).get('slug'), []);
  const statusUrl = useMemo(() => `${window.location.host || 'monitor.pages.dev'}/status`, []);

  useEffect(() => {
    api.getPublicStatus(slug)
      .then((response) => {
        setData(response);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof ApiClientError && err.status === 404
          ? 'Public Status is not available.'
          : 'Could not load Public Status.');
      })
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <main className="public-status-page" role="main">
        <section className="public-status-hero">
          <p className="public-status-kicker">{statusUrl}</p>
          <h1>Loading system status...</h1>
        </section>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="public-status-page" role="main">
        <section className="public-status-hero public-status-hero--unavailable">
          <p className="public-status-kicker">{statusUrl}</p>
          <h1>{error ?? 'Public Status is not available.'}</h1>
        </section>
      </main>
    );
  }

  return (
    <main className="public-status-page" role="main">
      <section className="public-status-hero">
        <div>
          <p className="public-status-kicker">{statusUrl}</p>
          <h1>System Status</h1>
          <p>{data.message}</p>
        </div>
        <div className="public-status-hero__state">
          <StatusBadge status={badgeStatus(data.status)} />
          <span>Updated {formatRelative(data.updated_at)}</span>
        </div>
      </section>

      <section className="public-status-section" aria-label="Public monitors">
        <div className="public-status-section__header">
          <h2>Monitors</h2>
        </div>
        <div className="public-monitor-list">
          {data.monitors.length === 0 ? (
            <article className="public-monitor-card public-monitor-card--empty">
              <h2>No public monitors are visible</h2>
              <p>Status sharing is enabled, but this page has no monitor data to show.</p>
            </article>
          ) : data.monitors.map((monitor) => (
            <PublicMonitorCard key={monitor.id} monitor={monitor} />
          ))}
        </div>
      </section>

      {data.incidents.length > 0 && (
        <section className="public-status-section public-incidents" aria-label="Public incidents">
          <div className="public-status-section__header">
            <h2>Recent incidents</h2>
          </div>
          {data.incidents.map((incident) => (
            <article key={incident.id}>
              <h3>{incident.title}</h3>
              <p>{incident.status}</p>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

function PublicMonitorCard({ monitor }: { readonly monitor: PublicMonitor }) {
  const uptime = typeof monitor.uptime_ratio === 'number' ? monitor.uptime_ratio : null;
  return (
    <article className="public-monitor-card" aria-label={`${monitor.name} public monitor`}>
      <div className="public-monitor-card__identity">
        <h2>{monitor.name}</h2>
        {monitor.type && <p>{typeLabels[monitor.type]}</p>}
        {monitor.target_label && <p>{monitor.target_label}</p>}
      </div>
      <div className="public-monitor-card__uptime" aria-hidden="true">
        <span style={{ width: `${Math.max(0, Math.min(uptime ?? 0, 100))}%` }} />
      </div>
      <dl className="public-monitor-card__metrics">
        {'uptime_ratio' in monitor && (
          <div>
            <dt>Uptime</dt>
            <dd>{uptime == null ? '--' : `${uptime.toFixed(2)}%`}</dd>
          </div>
        )}
        {'latency_ms' in monitor && (
          <div>
            <dt><Gauge size={14} /> Latency</dt>
            <dd>{typeof monitor.latency_ms === 'number' ? `${monitor.latency_ms}ms` : '--'}</dd>
          </div>
        )}
        <div>
          <dt>Last update</dt>
          <dd>{formatRelative(monitor.updated_at)}</dd>
        </div>
      </dl>
      <StatusBadge status={badgeStatus(monitor.status)} />
    </article>
  );
}

function badgeStatus(status: MonitorStatus) {
  return status === 'unknown' ? 'paused' : status;
}

function formatRelative(timestamp: number): string {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}
