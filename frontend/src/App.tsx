import './index.css';
import { useState, useMemo } from 'react';
import type { ReactNode } from 'react';
import { Server, Wifi, Activity, Clock, Globe, Bell } from 'lucide-react';
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
import { useNodes } from './hooks/useNodes';
import { useOverview } from './hooks/useOverview';
import { useMetrics } from './hooks/useMetrics';
import { useAuth } from './hooks/useAuth';
import type { TrendPoint } from './hooks/useMetrics';

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

  // Pick first node for the chart, or null
  const firstNodeId = nodes.length > 0 ? nodes[0].id : null;
  const { trendData, loading: metricsLoading } = useMetrics(firstNodeId, 24, isAuthenticated);

  // If no real metrics, use mock trend data
  const chartData = useMemo(() => {
    if (trendData.length > 0) return trendData;
    return generateMockTrend();
  }, [trendData]);

  const activityEvents = useMemo(() => deriveActivity(nodes), [nodes]);
  const lastRefreshText = nodesLoading ? 'Loading...' : `Last refresh: just now`;

  return (
    <div className="dashboard">
      {/* ── Header ── */}
      <header className="dashboard-header animate-in" role="banner">
        <div>
          <h1>Dashboard</h1>
          <p className="subtitle">System overview and real-time monitoring</p>
        </div>
        <span className="header-timestamp">{lastRefreshText}</span>
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
            <NodeList nodes={nodes} />
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

function NodesContent() {
  const { isAuthenticated } = useAuth();
  const { nodes, loading, error, refetch } = useNodes(isAuthenticated);

  return (
    <div className="dashboard">
      <PageHeader title="Nodes" subtitle="Registered probe and synthetic monitoring targets" />
      {error && <ErrorBanner message={error} onRetry={refetch} />}
      {loading ? <NodeListSkeleton /> : <NodeList nodes={nodes} />}
    </div>
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

function PageHeader({ title, subtitle }: { readonly title: string; readonly subtitle: string }) {
  return (
    <header className="dashboard-header animate-in" role="banner">
      <div>
        <h1>{title}</h1>
        <p className="subtitle">{subtitle}</p>
      </div>
    </header>
  );
}

function ActivePage({ activeNav }: { readonly activeNav: PageId }) {
  switch (activeNav) {
    case 'nodes':
      return <NodesContent />;
    case 'agentless':
      return <PlaceholderContent title="Agentless" subtitle="Synthetic checks and external probes" icon={<Globe size={30} />} />;
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
          <ErrorBoundary><ActivePage activeNav={activeNav} /></ErrorBoundary>
        </main>
      </div>
    </LoginGate>
  );
}
