import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Activity, Clock, Gauge, RadioTower } from 'lucide-react';
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
          <p className="public-status-kicker">Public Status</p>
          <h1>Loading system status...</h1>
        </section>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="public-status-page" role="main">
        <section className="public-status-hero public-status-hero--unavailable">
          <p className="public-status-kicker">Public Status</p>
          <h1>{error ?? 'Public Status is not available.'}</h1>
        </section>
      </main>
    );
  }

  return (
    <main className="public-status-page" role="main">
      <section className="public-status-hero">
        <div>
          <p className="public-status-kicker">Public Status</p>
          <h1>System Status</h1>
          <p>{data.message}</p>
        </div>
        <div className="public-status-hero__state">
          <StatusBadge status={badgeStatus(data.status)} />
          <span>Updated {formatRelative(data.updated_at)}</span>
        </div>
      </section>

      <section className="public-status-summary" aria-label="Public status summary">
        <PublicMetric icon={<RadioTower size={18} />} label="Visible monitors" value={String(data.monitors.length)} />
        <PublicMetric icon={<Activity size={18} />} label="Operational state" value={labelForStatus(data.status)} />
        <PublicMetric icon={<Clock size={18} />} label="Incidents" value={String(data.incidents.length)} />
      </section>

      <section className="public-monitor-list" aria-label="Public monitors">
        {data.monitors.length === 0 ? (
          <article className="public-monitor-card public-monitor-card--empty">
            <h2>No public monitors are visible</h2>
            <p>Status sharing is enabled, but this page has no monitor data to show.</p>
          </article>
        ) : data.monitors.map((monitor) => (
          <PublicMonitorCard key={monitor.id} monitor={monitor} />
        ))}
      </section>

      {data.incidents.length > 0 && (
        <section className="public-incidents" aria-label="Public incidents">
          <h2>Incidents</h2>
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

function PublicMetric({ icon, label, value }: { readonly icon: ReactNode; readonly label: string; readonly value: string }) {
  return (
    <article className="public-status-metric">
      <span aria-hidden="true">{icon}</span>
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}

function PublicMonitorCard({ monitor }: { readonly monitor: PublicMonitor }) {
  return (
    <article className="public-monitor-card" aria-label={`${monitor.name} public monitor`}>
      <div className="public-monitor-card__header">
        <div>
          <h2>{monitor.name}</h2>
          {monitor.type && <p>{typeLabels[monitor.type]}</p>}
          {monitor.target_label && <p>{monitor.target_label}</p>}
        </div>
        <StatusBadge status={badgeStatus(monitor.status)} />
      </div>
      <dl className="public-monitor-card__metrics">
        {'uptime_ratio' in monitor && (
          <div>
            <dt>Uptime</dt>
            <dd>{typeof monitor.uptime_ratio === 'number' ? `${monitor.uptime_ratio.toFixed(2)}%` : '--'}</dd>
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
    </article>
  );
}

function badgeStatus(status: MonitorStatus) {
  return status === 'unknown' ? 'paused' : status;
}

function labelForStatus(status: MonitorStatus): string {
  if (status === 'online') return 'Operational';
  if (status === 'degraded') return 'Degraded';
  if (status === 'offline') return 'Incident';
  return 'No data yet';
}

function formatRelative(timestamp: number): string {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}
