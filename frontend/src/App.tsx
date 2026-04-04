import './index.css';
import { useState, useMemo } from 'react';
import { Server, Wifi, Activity, Clock } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { MetricCard } from './components/MetricCard';
import { TrendChart } from './components/TrendChart';
import { UptimeRing } from './components/UptimeRing';
import { NodeList } from './components/NodeList';
import { ActivityFeed } from './components/ActivityFeed';
import type { ActivityEvent } from './components/ActivityFeed';
import { MetricCardSkeleton } from './components/Skeleton';
import { ErrorBanner } from './components/ErrorBanner';
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

function deriveActivity(nodes: ReadonlyArray<{ readonly name: string; readonly status: string; readonly last_heartbeat?: number }>): ReadonlyArray<ActivityEvent> {
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
      <header className="dashboard-header animate-in">
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
            <div className="card trend-chart"><div className="skeleton" style={{ width: '100%', height: 260 }} /></div>
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
            <div className="card node-list">
              <h3 className="section-title">Monitored Nodes</h3>
              <div className="skeleton" style={{ width: '100%', height: 180 }} />
            </div>
          ) : (
            <NodeList nodes={nodes} />
          )}
        </div>
        <div className="animate-in delay-7">
          <ActivityFeed events={activityEvents as ActivityEvent[]} />
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const [activeNav, setActiveNav] = useState('dashboard');
  const { logout } = useAuth();

  return (
    <LoginGate>
      <div className="app-shell">
        <Sidebar activeId={activeNav} onNavigate={(id) => {
          if (id === 'logout') { logout(); return; }
          setActiveNav(id);
        }} />

        <main className="main-content">
          {activeNav === 'settings' ? <Settings /> : <DashboardContent />}
        </main>
      </div>
    </LoginGate>
  );
}
