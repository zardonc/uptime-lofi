import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Clock, Server, TrendingUp } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, ApiClientError } from '../api/client';
import type {
  StatisticsLeaderboards,
  StatisticsLeaderboardEntry,
  StatisticsRange,
  StatisticsSummary,
  StatisticsTrends,
} from '../api/types';
import { ErrorBanner } from './ErrorBanner';
import { MetricCard } from './MetricCard';
import { MetricCardSkeleton, TrendChartSkeleton } from './Skeleton';

type StatisticsState = {
  readonly summary: StatisticsSummary | null;
  readonly leaderboards: StatisticsLeaderboards | null;
  readonly trends: StatisticsTrends | null;
};

const RANGE_LABELS: Readonly<Record<StatisticsRange, string>> = {
  '24h': '24 hours',
  '7d': '7 days',
  '30d': '30 days',
};

export function StatisticsPage() {
  const [range, setRange] = useState<StatisticsRange>('7d');
  const [state, setState] = useState<StatisticsState>({ summary: null, leaderboards: null, trends: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStatistics = async () => {
    setLoading(true);
    setError(null);
    try {
      const [summary, leaderboards, trends] = await Promise.all([
        api.getStatisticsSummary(range),
        api.getStatisticsLeaderboards(range),
        api.getStatisticsTrends(range),
      ]);
      setState({
        summary: summary.data,
        leaderboards: leaderboards.data,
        trends: trends.data,
      });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not load statistics.');
      setState({ summary: null, leaderboards: null, trends: null });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatistics();
  }, [range]);

  const systemLoad = useMemo(() => {
    return (state.trends?.system_load ?? []).map((point) => ({
      time: formatShortTime(point.time),
      cpu: point.cpu_percent ?? 0,
      mem: point.mem_percent ?? 0,
    }));
  }, [state.trends]);

  return (
    <div className="dashboard statistics-page">
      <header className="dashboard-header animate-in" role="banner">
        <div>
          <h1>Statistics</h1>
          <p className="subtitle">Historical reliability, slow spots, and workload pressure</p>
        </div>
        <label className="statistics-range">
          Period
          <select value={range} onChange={(event) => setRange(event.target.value as StatisticsRange)}>
            <option value="24h">24 hours</option>
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
          </select>
        </label>
      </header>

      {error && <ErrorBanner message={error} onRetry={loadStatistics} />}

      <section className="stats-grid" aria-label={`${RANGE_LABELS[range]} reliability summary`}>
        {loading || !state.summary ? (
          <>
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </>
        ) : (
          <>
            <MetricCard icon={<TrendingUp size={18} />} label="Availability" value={formatPercentValue(state.summary.uptime_ratio)} suffix={state.summary.uptime_ratio === null ? '' : '%'} />
            <MetricCard icon={<AlertTriangle size={18} />} label="Incidents" value={state.summary.incident_count} />
            <MetricCard icon={<Clock size={18} />} label="Downtime" value={formatDuration(state.summary.total_downtime_sec)} />
            <MetricCard icon={<Activity size={18} />} label="Avg Latency" value={formatNumberValue(state.summary.avg_latency_ms)} suffix={state.summary.avg_latency_ms === null ? '' : 'ms'} />
          </>
        )}
      </section>

      {loading ? (
        <TrendChartSkeleton />
      ) : (
        <>
          <section className="statistics-leaderboards" aria-label="Statistics leaderboards">
            <Leaderboard title="Downtime" empty="No downtime recorded for this period." entries={state.leaderboards?.downtime ?? []} />
            <Leaderboard title="Slowest monitors" empty="No latency samples recorded for this period." entries={state.leaderboards?.slowest ?? []} />
            <Leaderboard title="Resource load" empty="No agent resource metrics recorded for this period." entries={state.leaderboards?.resource_heavy ?? []} />
          </section>

          <section className="statistics-trends">
            <article className="card statistics-chart" aria-label="Availability trend">
              <div className="statistics-section-heading">
                <h2>Availability Trend</h2>
                <span>{RANGE_LABELS[range]}</span>
              </div>
              {(state.trends?.availability ?? []).length === 0 ? (
                <NoData title="No availability trend yet" copy="Rollups appear after checks have been recorded." />
              ) : (
                <div className="statistics-chart__canvas">
                  <ResponsiveContainer>
                    <BarChart data={state.trends?.availability ?? []} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} tickLine={false} axisLine={{ stroke: 'var(--border-light)' }} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(value: number) => `${value}%`} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} />
                      <Bar dataKey="uptime_ratio" name="Availability %" fill="var(--morandi-500)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </article>

            <article className="card statistics-chart" aria-label="System load trend">
              <div className="statistics-section-heading">
                <h2>System Load Trend</h2>
                <span>Agent monitors</span>
              </div>
              {systemLoad.length === 0 ? (
                <NoData title="No system load samples" copy="CPU and memory trends appear when agent monitors report metrics." />
              ) : (
                <div className="statistics-chart__canvas">
                  <ResponsiveContainer>
                    <AreaChart data={systemLoad} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                      <XAxis dataKey="time" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} tickLine={false} axisLine={{ stroke: 'var(--border-light)' }} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(value: number) => `${value}%`} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} />
                      <Area type="monotone" dataKey="cpu" name="CPU %" stroke="var(--chart-line)" fill="var(--chart-fill-start)" strokeWidth={2} dot={false} />
                      <Area type="monotone" dataKey="mem" name="Memory %" stroke="var(--chart-line-secondary)" fill="var(--chart-fill-secondary-start)" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </article>
          </section>
        </>
      )}
    </div>
  );
}

function Leaderboard({
  title,
  empty,
  entries,
}: {
  readonly title: string;
  readonly empty: string;
  readonly entries: ReadonlyArray<StatisticsLeaderboardEntry>;
}) {
  return (
    <article className="card statistics-leaderboard" aria-label={`${title} leaderboard`}>
      <div className="statistics-section-heading">
        <h2>{title}</h2>
        <span>Top {Math.max(entries.length, 0)}</span>
      </div>
      {entries.length === 0 ? (
        <NoData title="No data" copy={empty} />
      ) : (
        <ol>
          {entries.map((entry) => (
            <li key={`${title}-${entry.monitor_id}`}>
              <span className="statistics-leaderboard__rank">{entries.indexOf(entry) + 1}</span>
              <div>
                <strong>{entry.monitor_name}</strong>
                <span>{entry.monitor_type} · {entry.sample_count} samples</span>
              </div>
              <b>{entry.label}</b>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

function NoData({ title, copy }: { readonly title: string; readonly copy: string }) {
  return (
    <div className="statistics-empty">
      <Server size={18} />
      <strong>{title}</strong>
      <p>{copy}</p>
    </div>
  );
}

const tooltipStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-mid)',
  borderRadius: 'var(--radius-md)',
  fontSize: '13px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
};

const tooltipLabelStyle = { color: 'var(--text-secondary)', fontWeight: 500 };

function formatPercentValue(value: number | null): string {
  return value === null ? '--' : value.toFixed(2);
}

function formatNumberValue(value: number | null): string {
  return value === null ? '--' : String(Math.round(value));
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatShortTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
