import './index.css';
import { useEffect, useState, useMemo } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Server, Wifi, Activity, Clock, Bell, Plus, RefreshCw } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { MetricCard } from './components/MetricCard';
import { TrendChart } from './components/TrendChart';
import { UptimeRing } from './components/UptimeRing';
import { NodeList } from './components/NodeList';
import { ActivityFeed } from './components/ActivityFeed';
import type { ActivityEvent } from './components/ActivityFeed';
import { MetricCardSkeleton, NodeListSkeleton, ActivityFeedSkeleton, TrendChartSkeleton } from './components/Skeleton';
import { ErrorBanner } from './components/ErrorBanner';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginGate } from './components/LoginGate';
import { Settings } from './components/Settings';
import { ProbeSetup } from './components/ProbeSetup';
import { useNodes } from './hooks/useNodes';
import { useOverview } from './hooks/useOverview';
import { useMetrics } from './hooks/useMetrics';
import { useAuth } from './hooks/useAuth';
import type { TrendPoint } from './hooks/useMetrics';
import { api, ApiClientError } from './api/client';
import type { AgentlessCheck } from './api/types';

// ── Fallback: generate synthetic trend data when no metrics exist ──
function generateMockTrend(): ReadonlyArray<TrendPoint> {
  return Array.from({ length: 24 }, (_, i) => ({
    time: `${i.toString().padStart(2, '0')}:00`,
    cpu: Math.round((35 + Math.sin(i / 3) * 18 + (Math.random() - 0.5) * 10) * 10) / 10,
    mem: Math.round((58 + Math.cos(i / 4) * 12 + (Math.random() - 0.5) * 6) * 10) / 10,
    ping: Math.round(45 + Math.sin(i / 2) * 25 + (Math.random() - 0.5) * 15),
  }));
}

// ── Derive activity events from node state ──
function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

function deriveActivity(nodes: ReadonlyArray<{ readonly name: string; readonly status: string; readonly last_heartbeat?: number | null }>): ReadonlyArray<ActivityEvent> {
  return nodes.slice(0, 5).map((n, i) => ({
    id: `derived-${i}`,
    timestamp: n.last_heartbeat ? formatRelativeTime(n.last_heartbeat) : 'just now',
    type: n.status === 'online' ? 'online' : n.status === 'offline' ? 'offline' : 'warning',
    node: n.name,
    message: n.status === 'online' ? 'Node reporting normally' : n.status === 'offline' ? 'Node not responding' : 'Node performance degraded',
  }));
}

function DashboardContent() {
  const { isAuthenticated } = useAuth();
  const { nodes, loading: nodesLoading, error: nodesError, refetch: refetchNodes } = useNodes(isAuthenticated);
  const { stats, loading: statsLoading, error: statsError, refetch: refetchStats } = useOverview(isAuthenticated);
  const [lastRefreshAt, setLastRefreshAt] = useState(() => Date.now());

  // Pick first node for the chart, or null
  const firstNodeId = nodes.length > 0 ? nodes[0].id : null;
  const { trendData, loading: metricsLoading } = useMetrics(firstNodeId, 24, isAuthenticated);

  // If no real metrics, use mock trend data
  const chartData = useMemo(() => {
    if (trendData.length > 0) return trendData;
    return generateMockTrend();
  }, [trendData]);

  const activityEvents = useMemo(() => deriveActivity(nodes), [nodes]);
  const lastRefreshText = nodesLoading ? 'Loading...' : `Last refresh: ${formatRelativeTime(Math.floor(lastRefreshAt / 1000))}`;
  const handleRefresh = () => {
    setLastRefreshAt(Date.now());
    refetchNodes();
    refetchStats();
  };

  return (
    <div className="dashboard">
      {/* ── Header ── */}
      <header className="dashboard-header animate-in" role="banner">
        <div>
          <h1>Dashboard</h1>
          <p className="subtitle">System overview and real-time monitoring</p>
        </div>
        <div className="dashboard-header__actions">
          <span className="header-timestamp">{lastRefreshText}</span>
          <button type="button" className="header-refresh" onClick={handleRefresh} disabled={nodesLoading || statsLoading}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </header>

      {/* ── Error Banners ── */}
      {nodesError && <ErrorBanner message={nodesError} onRetry={refetchNodes} />}
      {statsError && <ErrorBanner message={statsError} onRetry={refetchStats} />}

      {/* ── Stats Row ── */}
      <section className="stats-grid">
        {statsLoading ? (
          <>
            <div className="animate-in delay-1"><MetricCardSkeleton /></div>
            <div className="animate-in delay-2"><MetricCardSkeleton /></div>
            <div className="animate-in delay-3"><MetricCardSkeleton /></div>
            <div className="animate-in delay-4"><MetricCardSkeleton /></div>
          </>
        ) : (
          <>
            <div className="animate-in delay-1">
              <MetricCard
                icon={<Server size={18} />}
                label="Total Nodes"
                value={stats.totalNodes}
              />
            </div>
            <div className="animate-in delay-2">
              <MetricCard
                icon={<Wifi size={18} />}
                label="Online"
                value={stats.onlineNodes}
                suffix={` / ${stats.totalNodes}`}
              />
            </div>
            <div className="animate-in delay-3">
              <MetricCard
                icon={<Activity size={18} />}
                label="Avg Uptime"
                value={typeof stats.avgUptimeRatio === 'number' ? stats.avgUptimeRatio.toFixed(2) : '—'}
                suffix="%"
              />
            </div>
            <div className="animate-in delay-4">
              <MetricCard
                icon={<Clock size={18} />}
                label="Avg Ping"
                value={stats.avgPing}
                suffix="ms"
              />
            </div>
          </>
        )}
      </section>

      {/* ── Charts Row ── */}
      <section className="charts-row">
        <div className="animate-in delay-5">
          {metricsLoading ? (
            <TrendChartSkeleton />
          ) : (
            <TrendChart data={chartData as TrendPoint[]} />
          )}
        </div>
        <div className="animate-in delay-5">
          <UptimeRing percentage={typeof stats.avgUptimeRatio === 'number' ? stats.avgUptimeRatio : 100} />
        </div>
      </section>

      {/* ── Bottom Row ── */}
      <section className="bottom-row">
        <div className="animate-in delay-6">
          {nodesLoading ? (
            <NodeListSkeleton />
          ) : (
            <NodeList nodes={nodes} onRefresh={refetchNodes} />
          )}
        </div>
        <div className="animate-in delay-7">
          {nodesLoading ? (
            <ActivityFeedSkeleton />
          ) : (
            <ActivityFeed events={activityEvents as ActivityEvent[]} />
          )}
        </div>
      </section>
    </div>
  );
}

type PageId = 'dashboard' | 'nodes' | 'agentless' | 'statistics' | 'alerts' | 'settings';

function NodesContent({ onNavigate }: { readonly onNavigate: (page: PageId) => void }) {
  const { isAuthenticated } = useAuth();
  const { nodes, loading, error, refetch } = useNodes(isAuthenticated);
  const [addMode, setAddMode] = useState<'chooser' | 'probe' | null>(null);

  return (
    <div className="dashboard">
      <PageHeader
        title="Nodes"
        subtitle="Manage agent probes and synthetic checks"
        actions={<button type="button" className="page-header__primary" onClick={() => setAddMode('chooser')}><Plus size={18} />Add Node</button>}
      />
      {addMode === 'chooser' && <AddNodeChooser onAddProbe={() => setAddMode('probe')} onAddAgentless={() => onNavigate('agentless')} />}
      {addMode === 'probe' && (
        <section className="card nodes-add-panel" aria-label="Add agent probe">
          <div className="nodes-add-panel__header">
            <div>
              <h2>Agent Probe</h2>
              <p>Generate the one-command probe installer for a server.</p>
            </div>
            <button type="button" className="node-action" onClick={() => setAddMode('chooser')}>Back</button>
          </div>
          <ProbeSetup />
        </section>
      )}
      {error && <ErrorBanner message={error} onRetry={refetch} />}
      {loading ? <NodeListSkeleton /> : <NodeList nodes={nodes} onRefresh={refetch} />}
    </div>
  );
}

function AddNodeChooser({ onAddProbe, onAddAgentless }: { readonly onAddProbe: () => void; readonly onAddAgentless: () => void }) {
  return (
    <section className="nodes-add-chooser card" aria-label="Choose node type">
      <article className="nodes-add-chooser__option">
        <h2>Agent Probe</h2>
        <p>Install a small probe on a server to report CPU, memory, ping, Docker containers, and heartbeat.</p>
        <button type="button" className="page-header__primary" onClick={onAddProbe}>Add Agent Probe</button>
      </article>
      <article className="nodes-add-chooser__option">
        <h2>Agentless Check</h2>
        <p>Monitor an HTTP URL or TCP endpoint from the backend scheduler.</p>
        <button type="button" className="page-header__primary" onClick={onAddAgentless}>Add Agentless Check</button>
      </article>
    </section>
  );
}

type AgentlessTab = 'http' | 'tcp';

const TCP_AVAILABLE_COPY = 'TCP checks run from the backend scheduler. Private, localhost, and Cloudflare-blocked targets are rejected before storage.';

const EMPTY_AGENTLESS_COPY = 'Create an HTTP or TCP check. Checks run from the backend, so the dashboard does not need to stay open.';

function isTcpCheck(check: AgentlessCheck): boolean {
  return check.type === 'agentless_tcp';
}

function getCheckConfig(check: AgentlessCheck): Record<string, unknown> {
  if (check.config) return { ...check.config };
  if (!check.config_json) return {};
  try {
    return JSON.parse(check.config_json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getCheckTarget(check: AgentlessCheck): string {
  if (check.target) return check.target;
  const config = getCheckConfig(check);
  if (isTcpCheck(check)) return `${String(config.host ?? 'unknown')}:${String(config.port ?? '--')}`;
  return String(config.url ?? 'unknown');
}

function getLatestResult(check: AgentlessCheck) {
  if (check.latest_result) return check.latest_result;
  return {
    timestamp: check.latest_timestamp ?? null,
    is_up: typeof check.latest_is_up === 'number' ? check.latest_is_up === 1 : check.latest_is_up ?? null,
    latency_ms: check.latest_ping_ms ?? null,
    error_text: check.latest_error_text ?? null,
  };
}

function formatResultStatus(check: AgentlessCheck): string {
  if (check.status === 'paused') return 'Paused';
  const latest = getLatestResult(check);
  if (latest.is_up === null) return 'No data yet';
  return latest.is_up ? 'Reachable' : 'Failed';
}

function formatLatency(check: AgentlessCheck): string {
  const latency = getLatestResult(check).latency_ms;
  return typeof latency === 'number' ? `${latency}ms` : '--';
}

function formatLastRun(check: AgentlessCheck): string {
  const timestamp = getLatestResult(check).timestamp;
  return typeof timestamp === 'number' ? formatRelativeTime(timestamp) : 'No results yet';
}

function AgentlessContent() {
  const [activeTab, setActiveTab] = useState<AgentlessTab>('http');
  const [checks, setChecks] = useState<ReadonlyArray<AgentlessCheck>>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const tcpAvailable = true;

  const loadChecks = async () => {
    try {
      setLoadError(null);
      const response = await api.getAgentlessChecks();
      setChecks(response.data);
    } catch (error) {
      setLoadError(error instanceof ApiClientError ? error.message : 'Could not load Agentless checks.');
    }
  };

  useEffect(() => {
    void loadChecks();
  }, []);

  const visibleChecks = checks.filter((check) => activeTab === 'tcp' ? isTcpCheck(check) : !isTcpCheck(check));

  const handleHttpSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setSaving(true);
    setSaveError(null);
    try {
      const created = await api.createHttpCheck({
        name: String(formData.get('name') ?? ''),
        url: String(formData.get('url') ?? ''),
        interval: Number(formData.get('interval')),
        timeout: Number(formData.get('timeout')),
        expected_status: Number(formData.get('expected_status')),
      });
      setChecks((current) => [created.data, ...current.filter((check) => check.id !== created.data.id)]);
      loadChecks().catch(() => undefined);
      setSaveError(null);
      form.reset();
    } catch (error) {
      setSaveError(error instanceof ApiClientError ? error.message : 'Could not save this check. Review the fields and try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleTcpSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setSaving(true);
    setSaveError(null);
    try {
      const created = await api.createTcpCheck({
        name: String(formData.get('name') ?? ''),
        host: String(formData.get('host') ?? ''),
        port: Number(formData.get('port')),
        timeout: Number(formData.get('timeout')),
        interval: Number(formData.get('interval')),
      });
      setChecks((current) => [created.data, ...current.filter((check) => check.id !== created.data.id)]);
      loadChecks().catch(() => undefined);
      setSaveError(null);
      form.reset();
    } catch (error) {
      setSaveError(error instanceof ApiClientError ? error.message : 'Could not save this check. Review the fields and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dashboard agentless-page">
      <PageHeader
        title="Agentless"
        subtitle="Configure HTTP and TCP checks that run from the backend scheduler"
        actions={<><button type="button" className="page-header__primary" onClick={() => setActiveTab('http')}>Create HTTP Check</button><button type="button" className="agentless-page__secondary" onClick={() => setActiveTab('tcp')}>Create TCP Check</button></>}
      />
      {loadError && <ErrorBanner message={loadError} onRetry={loadChecks} />}
      <section className="agentless-page__intro card">
        <p>Checks run from backend/Worker scheduled execution, not from the browser. Recent results below update after the backend scheduler runs.</p>
      </section>
      <div className="agentless-tabs" role="tablist" aria-label="Agentless check types">
        <button type="button" aria-selected={activeTab === 'http'} className="agentless-tabs__button" onClick={() => setActiveTab('http')}>HTTP Checks</button>
        <button type="button" aria-selected={activeTab === 'tcp'} className="agentless-tabs__button" onClick={() => setActiveTab('tcp')}>TCP Checks</button>
      </div>
      {saveError && <p className="agentless-form__error" role="alert">{saveError}</p>}
      <section className="agentless-page__grid">
        {activeTab === 'http' ? <HttpCheckForm disabled={saving} onSubmit={handleHttpSubmit} /> : <TcpCheckForm disabled={saving || !tcpAvailable} onSubmit={handleTcpSubmit} />}
        <RecentAgentlessResults checks={visibleChecks} />
      </section>
    </div>
  );
}

function HttpCheckForm({ disabled, onSubmit }: { readonly disabled: boolean; readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form className="agentless-form card" aria-label="HTTP check form" onSubmit={onSubmit}>
      <h2>Create HTTP Check</h2>
      <label>Check name<input name="name" placeholder="Homepage" required /></label>
      <label>URL<input name="url" type="url" placeholder="https://example.com/health" required /></label>
      <label htmlFor="agentless-http-interval">Interval</label><input id="agentless-http-interval" name="interval" type="number" min="60" defaultValue="300" aria-describedby="agentless-http-interval-help" required /><span id="agentless-http-interval-help">How often the backend should run this check.</span>
      <label htmlFor="agentless-http-timeout">Timeout</label><input id="agentless-http-timeout" name="timeout" type="number" min="1" defaultValue="10" aria-describedby="agentless-http-timeout-help" required /><span id="agentless-http-timeout-help">How long to wait before marking the check failed.</span>
      <label>Expected status<input name="expected_status" type="number" min="100" max="599" defaultValue="200" required /></label>
      <button type="submit" className="page-header__primary" disabled={disabled}>Create HTTP Check</button>
    </form>
  );
}

function TcpCheckForm({ disabled, onSubmit }: { readonly disabled: boolean; readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form className="agentless-form card" aria-label="TCP check form" onSubmit={onSubmit}>
      <h2>Create TCP Check</h2>
      <p className="agentless-form__warning">{TCP_AVAILABLE_COPY}</p>
      <label>Check name<input name="name" placeholder="Postgres" required /></label>
      <label>Host<input name="host" placeholder="db.example.com" required /></label>
      <label>Port<input name="port" type="number" min="1" max="65535" placeholder="5432" required /></label>
      <label>Timeout<input name="timeout" type="number" min="1" defaultValue="10" required /></label>
      <label>Interval<input name="interval" type="number" min="60" defaultValue="300" required /></label>
      <button type="submit" className="page-header__primary" disabled={disabled}>Create TCP Check</button>
    </form>
  );
}

function RecentAgentlessResults({ checks }: { readonly checks: ReadonlyArray<AgentlessCheck> }) {
  return (
    <section className="agentless-results card" aria-label="Recent synthetic results">
      <div>
        <h2>Recent results</h2>
        <p>Results are produced by the backend scheduler. No browser tab needs to stay open.</p>
      </div>
      {checks.length === 0 ? (
        <div className="agentless-results__empty">
          <h3>No synthetic checks yet</h3>
          <p>{EMPTY_AGENTLESS_COPY}</p>
          <p>No results yet. The next scheduled run will appear here.</p>
        </div>
      ) : (
        <div className="agentless-results__list">
          {checks.map((check) => (
            <article className="agentless-result" key={check.id}>
              <div>
                <h3>{check.name}</h3>
                <p>{getCheckTarget(check)}</p>
              </div>
              <span className="agentless-result__badge">{formatResultStatus(check)}</span>
              <dl>
                <div><dt>Latency</dt><dd>{formatLatency(check)}</dd></div>
                <div><dt>Last run</dt><dd>{formatLastRun(check)}</dd></div>
              </dl>
              {getLatestResult(check).error_text && <p className="agentless-result__error">{getLatestResult(check).error_text}</p>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function StatisticsContent() {
  const { isAuthenticated } = useAuth();
  const { nodes } = useNodes(isAuthenticated);
  const firstNodeId = nodes.length > 0 ? nodes[0].id : null;
  const { trendData, loading } = useMetrics(firstNodeId, 24, isAuthenticated);
  const chartData = trendData.length > 0 ? trendData : generateMockTrend();

  return (
    <div className="dashboard">
      <PageHeader title="Statistics" subtitle="Telemetry trends for the first reporting node" />
      {loading ? <TrendChartSkeleton /> : <TrendChart data={chartData as TrendPoint[]} />}
    </div>
  );
}

function PlaceholderContent({ title, subtitle, icon }: { readonly title: string; readonly subtitle: string; readonly icon: ReactNode }) {
  return (
    <div className="dashboard">
      <PageHeader title={title} subtitle={subtitle} />
      <div className="card empty-page" role="region" aria-label={`${title} page`}>
        <div className="empty-page__icon">{icon}</div>
        <h2>{title} is not configured yet</h2>
        <p>This section is ready for future setup. Use Dashboard, Nodes, or Settings for the current self-host flow.</p>
      </div>
    </div>
  );
}

function PageHeader({ title, subtitle, actions }: { readonly title: string; readonly subtitle: string; readonly actions?: ReactNode }) {
  return (
    <header className="dashboard-header animate-in" role="banner">
      <div>
        <h1>{title}</h1>
        <p className="subtitle">{subtitle}</p>
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}

function ActivePage({ activeNav, onNavigate }: { readonly activeNav: PageId; readonly onNavigate: (page: PageId) => void }) {
  switch (activeNav) {
    case 'nodes':
      return <NodesContent onNavigate={onNavigate} />;
    case 'agentless':
      return <AgentlessContent />;
    case 'statistics':
      return <StatisticsContent />;
    case 'alerts':
      return <PlaceholderContent title="Alerts" subtitle="Notification routing and incident rules" icon={<Bell size={30} />} />;
    case 'settings':
      return <Settings />;
    case 'dashboard':
    default:
      return <DashboardContent />;
  }
}

export default function App() {
  const [activeNav, setActiveNav] = useState<PageId>('dashboard');
  const { logout } = useAuth();

  return (
    <LoginGate>
      <div className="app-shell">
        <Sidebar activeId={activeNav} onNavigate={(id) => {
          if (id === 'logout') { logout(); return; }
          setActiveNav(id as PageId);
        }} />

        <main className="main-content" role="main">
          <ErrorBoundary><ActivePage activeNav={activeNav} onNavigate={setActiveNav} /></ErrorBoundary>
        </main>
      </div>
    </LoginGate>
  );
}
