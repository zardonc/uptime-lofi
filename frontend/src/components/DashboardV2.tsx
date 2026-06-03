import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Activity, AlertTriangle, Clock, RefreshCw, Server, ShieldCheck, TrendingUp, Wifi } from 'lucide-react';
import { api, ApiClientError } from '../api/client';
import type { AlertEvent, Monitor, MonitorStatus, StatisticsSummary } from '../api/types';
import { ErrorBanner } from './ErrorBanner';
import { MetricCard } from './MetricCard';
import { MetricCardSkeleton } from './Skeleton';
import { StatusBadge } from './StatusBadge';

type DashboardState = {
  readonly monitors: ReadonlyArray<Monitor>;
  readonly summary: StatisticsSummary | null;
  readonly alertEvents: ReadonlyArray<AlertEvent>;
};

type DashboardActivity = {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly status: MonitorStatus;
  readonly timestamp: number;
};

const typeLabels: Record<Monitor['type'], string> = {
  agent: 'Agent Probe',
  http: 'HTTP Check',
  tcp: 'TCP Check',
};

export function DashboardV2() {
  const [state, setState] = useState<DashboardState>({ monitors: [], summary: null, alertEvents: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState(() => Date.now());

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const [monitorsResponse, summaryResponse, alertHistoryResponse] = await Promise.all([
        api.getMonitors(),
        api.getStatisticsSummary('24h'),
        api.getAlertHistory(),
      ]);
      setState({
        monitors: monitorsResponse.data,
        summary: summaryResponse.data,
        alertEvents: alertHistoryResponse.data,
      });
      setLastRefreshAt(Date.now());
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not load dashboard.');
      setState({ monitors: [], summary: null, alertEvents: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  const issueMonitors = useMemo(
    () => state.monitors.filter((monitor) => monitor.status === 'offline' || monitor.status === 'degraded'),
    [state.monitors],
  );

  const activeIncidents = useMemo(
    () => state.alertEvents.filter((event) => event.event_type === 'firing' || event.event_type === 'pending').slice(0, 4),
    [state.alertEvents],
  );

  const recentActivity = useMemo(() => {
    const monitorEvents: DashboardActivity[] = state.monitors.map((monitor) => ({
      id: `monitor-${monitor.id}`,
      title: monitor.name,
      detail: `${typeLabels[monitor.type]} is ${statusLabel(monitor.status)}`,
      status: monitor.status,
      timestamp: monitor.latest.checked_at ?? monitor.updated_at,
    }));
    const alertEvents: DashboardActivity[] = state.alertEvents.map((event) => ({
      id: `alert-${event.id}`,
      title: event.rule_name,
      detail: `${event.monitor_name} ${event.event_type}`,
      status: event.event_type === 'recovered' ? 'online' : 'offline',
      timestamp: event.created_at,
    }));
    return [...monitorEvents, ...alertEvents]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 6);
  }, [state.alertEvents, state.monitors]);

  const onlineMonitors = state.monitors.filter((monitor) => monitor.status === 'online').length;
  const lastRefreshText = loading ? 'Loading...' : `Last refresh: ${formatRelative(Math.floor(lastRefreshAt / 1000))}`;
  const averageUptime = normalizePercent(state.summary?.uptime_ratio ?? null);

  return (
    <div className="dashboard dashboard-v2">
      <header className="dashboard-header animate-in" role="banner">
        <div>
          <h1>Dashboard</h1>
          <p className="subtitle">Current monitor health, active issues, and recent v2 activity</p>
        </div>
        <div className="dashboard-header__actions">
          <span className="header-timestamp">{lastRefreshText}</span>
          <button type="button" className="header-refresh" onClick={() => void loadDashboard()} disabled={loading}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </header>

      {error && <ErrorBanner message={error} onRetry={loadDashboard} />}

      <section className="stats-grid" aria-label="Dashboard summary">
        {loading || !state.summary ? (
          <>
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </>
        ) : (
          <>
            <MetricCard icon={<Server size={18} />} label="Monitors" value={state.monitors.length} />
            <MetricCard icon={<Wifi size={18} />} label="Online" value={onlineMonitors} suffix={` / ${state.monitors.length}`} />
            <MetricCard icon={<ShieldCheck size={18} />} label="Availability" value={formatPercent(state.summary.uptime_ratio)} suffix={state.summary.uptime_ratio === null ? '' : '%'} />
            <MetricCard icon={<Clock size={18} />} label="Avg Latency" value={formatNumber(state.summary.avg_latency_ms)} suffix={state.summary.avg_latency_ms === null ? '' : 'ms'} />
          </>
        )}
      </section>

      <article className="card dashboard-v2__issues" aria-label="Active issues">
        <SectionHeading icon={<AlertTriangle size={18} />} title="Active Issues" meta={`${issueMonitors.length + activeIncidents.length} open`} />
        {loading ? (
          <p className="dashboard-v2__muted">Loading issue state...</p>
        ) : issueMonitors.length === 0 && activeIncidents.length === 0 ? (
          <div className="dashboard-v2__empty">
            <strong>No active issues</strong>
            <p>All monitors are either online, paused, or waiting for their first result.</p>
          </div>
        ) : (
          <div className="dashboard-v2__issue-list">
            {issueMonitors.map((monitor) => (
              <IssueItem key={monitor.id} title={monitor.name} detail={monitor.latest.error_text ?? `${typeLabels[monitor.type]} is ${statusLabel(monitor.status)}`} status={monitor.status} />
            ))}
            {activeIncidents.map((event) => (
              <IssueItem key={event.id} title={event.rule_name} detail={`${event.monitor_name}: ${event.message}`} status="offline" />
            ))}
          </div>
        )}
      </article>

      <section className="dashboard-v2__overview-row" aria-label="Uptime and recent activity">
        <article className="card dashboard-v2__uptime" aria-label="Average uptime">
          <SectionHeading icon={<TrendingUp size={18} />} title="Avg Uptime" meta="24h" />
          {loading ? (
            <p className="dashboard-v2__muted">Loading uptime...</p>
          ) : averageUptime === null ? (
            <div className="dashboard-v2__empty">
              <strong>No uptime yet</strong>
              <p>Rollups appear after checks have been recorded.</p>
            </div>
          ) : (
            <div className="dashboard-v2__uptime-body">
              <div className="dashboard-v2__uptime-ring" style={{ '--uptime': `${averageUptime * 3.6}deg` } as CSSProperties}>
                <strong>{averageUptime.toFixed(1)}%</strong>
              </div>
              <p>{onlineMonitors} of {state.monitors.length} monitors online</p>
            </div>
          )}
        </article>
        <article className="card dashboard-v2__activity" aria-label="Recent activity">
          <SectionHeading icon={<Activity size={18} />} title="Recent Activity" meta="v2 latest state" />
          {loading ? (
            <p className="dashboard-v2__muted">Loading activity...</p>
          ) : recentActivity.length === 0 ? (
            <div className="dashboard-v2__empty">
              <strong>No activity yet</strong>
              <p>Checks, probe pushes, and alert events will appear after monitors run.</p>
            </div>
          ) : (
            <ol className="dashboard-v2__activity-list">
              {recentActivity.map((event) => (
                <li key={event.id}>
                  <StatusBadge status={event.status} />
                  <div>
                    <strong>{event.title}</strong>
                    <p>{event.detail}</p>
                  </div>
                  <time>{formatRelative(event.timestamp)}</time>
                </li>
              ))}
            </ol>
          )}
        </article>
      </section>

      <section className="card dashboard-v2__monitors" aria-label="Monitor status">
        <SectionHeading icon={<Server size={18} />} title="Monitor Status" meta={`${state.monitors.length} configured`} />
        {loading ? (
          <p className="dashboard-v2__muted">Loading monitors...</p>
        ) : state.monitors.length === 0 ? (
          <div className="dashboard-v2__empty">
            <strong>No monitors configured</strong>
            <p>Add an Agent Probe, HTTP Check, or TCP Check from Monitors.</p>
          </div>
        ) : (
          <div className="dashboard-v2__monitor-list">
            {state.monitors.map((monitor) => (
              <article key={monitor.id} className="dashboard-v2__monitor-card">
                <div>
                  <h2>{monitor.name}</h2>
                  <p>{typeLabels[monitor.type]} · {monitor.target.label}</p>
                </div>
                <StatusBadge status={monitor.status} />
                <dl>
                  <div><dt>Latency</dt><dd>{formatNumber(monitor.latest.latency_ms)}{monitor.latest.latency_ms === null ? '' : 'ms'}</dd></div>
                  <div><dt>Uptime</dt><dd>{formatPercent(monitor.latest.uptime_ratio)}{monitor.latest.uptime_ratio === null ? '' : '%'}</dd></div>
                  <div><dt>Last check</dt><dd>{monitor.latest.checked_at ? formatRelative(monitor.latest.checked_at) : 'No data yet'}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SectionHeading({ icon, title, meta }: { readonly icon: ReactNode; readonly title: string; readonly meta: string }) {
  return (
    <div className="dashboard-v2__section-heading">
      <span aria-hidden="true">{icon}</span>
      <h2>{title}</h2>
      <small>{meta}</small>
    </div>
  );
}

function IssueItem({ title, detail, status }: { readonly title: string; readonly detail: string; readonly status: MonitorStatus }) {
  return (
    <article className="dashboard-v2__issue">
      <StatusBadge status={status} />
      <div>
        <h3>{title}</h3>
        <p>{detail}</p>
      </div>
    </article>
  );
}

function statusLabel(status: MonitorStatus): string {
  if (status === 'unknown') return 'waiting for data';
  return status;
}

function formatPercent(value: number | null): string {
  const percent = normalizePercent(value);
  return percent === null ? '--' : percent.toFixed(2);
}

function formatNumber(value: number | null): string {
  return value === null ? '--' : String(Math.round(value));
}

function normalizePercent(value: number | null): number | null {
  if (value === null) return null;
  const percent = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, percent));
}

function formatRelative(timestamp: number): string {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}
