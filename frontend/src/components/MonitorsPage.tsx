import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Activity, ArrowLeft, Bell, ChevronDown, Clock, Cpu, Gauge, MemoryStick, Plus, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import { api, ApiClientError } from '../api/client';
import type { CreateMonitorRequest, Monitor, MonitorStatus, MonitorType } from '../api/types';
import { useAuth } from '../hooks/useAuth';
import { useMonitors } from '../hooks/useMonitors';
import { ErrorBanner } from './ErrorBanner';
import { StatusBadge } from './StatusBadge';

type FormMode = MonitorType | null;

const typeLabels: Record<MonitorType, string> = {
  agent: 'Agent Probe',
  http: 'HTTP Check',
  tcp: 'TCP Check',
};

const noData = '--';

export function MonitorsPage() {
  const { isAuthenticated } = useAuth();
  const { monitors, setMonitors, loading, error, refetch } = useMonitors(isAuthenticated);
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | MonitorType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | MonitorStatus>('all');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Monitor | null>(null);
  const [editTarget, setEditTarget] = useState<Monitor | null>(null);
  const [detailTarget, setDetailTarget] = useState<Monitor | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!addMenuOpen) return;
    const closeMenu = (event: MouseEvent) => {
      if (!addMenuRef.current?.contains(event.target as Node)) {
        setAddMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, [addMenuOpen]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return monitors.filter((monitor) => {
      const matchesQuery = !normalizedQuery ||
        monitor.name.toLowerCase().includes(normalizedQuery) ||
        monitor.target.label.toLowerCase().includes(normalizedQuery);
      const matchesType = typeFilter === 'all' || monitor.type === typeFilter;
      const matchesStatus = statusFilter === 'all' || monitor.status === statusFilter;
      return matchesQuery && matchesType && matchesStatus;
    });
  }, [monitors, query, statusFilter, typeFilter]);

  const upsertMonitor = (monitor: Monitor) => {
    setMonitors((current) => [monitor, ...current.filter((item) => item.id !== monitor.id)]);
    setDetailTarget((current) => current?.id === monitor.id ? monitor : current);
  };

  const handleCreate = async (payload: CreateMonitorRequest) => {
    try {
      setSaveError(null);
      const response = await api.createMonitor(payload);
      upsertMonitor(response.data);
      setFormMode(null);
      void refetch();
    } catch (err) {
      setSaveError(err instanceof ApiClientError ? err.message : 'Could not save this monitor.');
    }
  };

  const handlePauseResume = async (monitor: Monitor) => {
    setPendingId(monitor.id);
    try {
      const response = monitor.status === 'paused'
        ? await api.resumeMonitor(monitor.id)
        : await api.pauseMonitor(monitor.id);
      upsertMonitor(response.data);
    } finally {
      setPendingId(null);
    }
  };

  const handleEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editTarget) return;
    const data = new FormData(event.currentTarget);
    setPendingId(editTarget.id);
    try {
      const response = await api.updateMonitor(editTarget.id, {
        name: String(data.get('name') ?? ''),
        interval_sec: Number(data.get('interval_sec')),
        timeout_sec: Number(data.get('timeout_sec')),
        public_visible: data.get('public_visible') === 'on',
      });
      upsertMonitor(response.data);
      setEditTarget(null);
    } finally {
      setPendingId(null);
    }
  };

  const handleArchive = async () => {
    if (!deleteTarget) return;
    setPendingId(deleteTarget.id);
    try {
      await api.deleteMonitor(deleteTarget.id);
      setMonitors((current) => current.filter((monitor) => monitor.id !== deleteTarget.id));
      setDeleteTarget(null);
    } finally {
      setPendingId(null);
    }
  };

  const selectFormMode = (mode: MonitorType) => {
    setFormMode(mode);
    setAddMenuOpen(false);
  };

  return (
    <div className="dashboard monitors-page">
      <header className="dashboard-header animate-in" role="banner">
        <div>
          <h1>Monitors</h1>
          <p className="subtitle">Unified management for agent probes, HTTP checks, and TCP checks</p>
        </div>
        {!detailTarget && (
          <div className="page-header__actions monitors-page__add-actions">
            <div className="monitor-add-menu" ref={addMenuRef}>
              <button
                type="button"
                className="page-header__primary"
                aria-haspopup="menu"
                aria-expanded={addMenuOpen}
                onClick={() => setAddMenuOpen((value) => !value)}
              >
                <Plus size={18} /> Add Monitor <ChevronDown size={15} />
              </button>
              {addMenuOpen && (
                <div className="monitor-add-menu__panel" role="menu" aria-label="Add monitor options">
                  <button type="button" role="menuitem" onClick={() => selectFormMode('agent')}>Agent Probe</button>
                  <button type="button" role="menuitem" onClick={() => selectFormMode('http')}>HTTP Check</button>
                  <button type="button" role="menuitem" onClick={() => selectFormMode('tcp')}>TCP Check</button>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {error && <ErrorBanner message={error} onRetry={refetch} />}
      {saveError && <p className="agentless-form__error" role="alert">{saveError}</p>}
      {formMode && <MonitorForm mode={formMode} onCancel={() => setFormMode(null)} onCreate={(payload) => void handleCreate(payload)} />}

      {detailTarget ? (
        <MonitorDetailPage
          monitor={detailTarget}
          pending={pendingId === detailTarget.id}
          onBack={() => setDetailTarget(null)}
          onEdit={() => setEditTarget(detailTarget)}
          onPauseResume={() => void handlePauseResume(detailTarget)}
        />
      ) : (
        <>
          <section className="monitors-toolbar" aria-label="Monitor filters">
            <label className="monitors-search"><Search size={16} /><span>Search monitors</span><input aria-label="Search monitors" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or target" /></label>
            <label>Type<select aria-label="Type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as 'all' | MonitorType)}><option value="all">All</option><option value="agent">Agent Probe</option><option value="http">HTTP Check</option><option value="tcp">TCP Check</option></select></label>
            <label>Status<select aria-label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | MonitorStatus)}><option value="all">All</option><option value="online">Online</option><option value="degraded">Degraded</option><option value="offline">Offline</option><option value="paused">Paused</option><option value="unknown">Unknown</option></select></label>
          </section>

          {loading ? (
            <section className="card monitors-empty">Loading monitors...</section>
          ) : filtered.length === 0 ? (
            <section className="card monitors-empty"><h2>No monitors yet</h2><p>Create an agent probe, HTTP check, or TCP check to start building the v2 monitor domain.</p></section>
          ) : (
            <section className="monitors-list" aria-label="Monitor list">
              {filtered.map((monitor) => (
                <MonitorCard
                  key={monitor.id}
                  monitor={monitor}
                  pending={pendingId === monitor.id}
                  onEdit={() => setEditTarget(monitor)}
                  onPauseResume={() => void handlePauseResume(monitor)}
                  onDetails={() => setDetailTarget(monitor)}
                  onDelete={() => setDeleteTarget(monitor)}
                />
              ))}
            </section>
          )}
        </>
      )}

      {deleteTarget && (
        <div className="node-dialog" role="presentation">
          <div className="node-dialog__panel" role="dialog" aria-modal="true" aria-label={`Delete ${deleteTarget.name}?`}>
            <h3>Delete {deleteTarget.name}?</h3>
            <p>Historical results stay available for reports. The monitor leaves active management.</p>
            <div className="node-dialog__actions">
              <button type="button" className="node-action" onClick={() => setDeleteTarget(null)}>Keep Monitor</button>
              <button type="button" className="node-action node-action--danger" disabled={pendingId === deleteTarget.id} onClick={() => void handleArchive()}><Trash2 size={16} /> Delete Monitor</button>
            </div>
          </div>
        </div>
      )}

      {editTarget && (
        <MonitorEditDialog
          monitor={editTarget}
          pending={pendingId === editTarget.id}
          onCancel={() => setEditTarget(null)}
          onSubmit={(event) => void handleEdit(event)}
        />
      )}
    </div>
  );
}

function MonitorCard({ monitor, pending, onEdit, onPauseResume, onDetails, onDelete }: {
  readonly monitor: Monitor;
  readonly pending: boolean;
  readonly onEdit: () => void;
  readonly onPauseResume: () => void;
  readonly onDetails: () => void;
  readonly onDelete: () => void;
}) {
  const pauseLabel = monitor.status === 'paused' ? 'Resume' : 'Pause';
  return (
    <article className={`monitor-card monitor-card--${monitor.status}`} aria-label={`${monitor.name} monitor`}>
      <div className="monitor-card__identity">
        <div>
          <h2>{monitor.name}</h2>
          <p>{typeLabels[monitor.type]} · {monitor.target.label}</p>
        </div>
        <StatusBadge status={monitor.status === 'unknown' ? 'paused' : monitor.status} />
      </div>
      <div className="monitor-card__metrics">
        <Metric icon={<Activity size={17} />} label="Status" value={monitor.status === 'unknown' ? 'No result yet' : monitor.status} />
        <Metric icon={<Gauge size={17} />} label="Latency" value={formatMetric(monitor.latest.latency_ms, 'ms')} empty={monitor.latest.latency_ms == null} />
        <Metric icon={<Cpu size={17} />} label="CPU" value={formatMetric(monitor.latest.cpu_percent, '%')} empty={monitor.latest.cpu_percent == null} />
        <Metric icon={<MemoryStick size={17} />} label="Memory" value={formatMetric(monitor.latest.mem_percent, '%')} empty={monitor.latest.mem_percent == null} />
      </div>
      <div className="monitor-card__actions">
        <button type="button" className="node-action" onClick={onEdit}>Edit</button>
        <button type="button" className="node-action" disabled={pending} onClick={onPauseResume}>{pauseLabel}</button>
        <button type="button" className="node-action node-action--primary" onClick={onDetails}>Details</button>
        <button type="button" className="node-action node-action--danger" onClick={onDelete}>Delete</button>
      </div>
    </article>
  );
}

function MonitorEditDialog({ monitor, pending, onCancel, onSubmit }: {
  readonly monitor: Monitor;
  readonly pending: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="node-dialog monitor-edit-dialog-shell" role="presentation">
      <form className="node-dialog__panel monitor-edit-dialog" role="dialog" aria-modal="true" aria-label={`Edit ${monitor.name}`} onSubmit={onSubmit}>
        <div className="monitor-edit-dialog__header">
          <div>
            <h3>Edit {monitor.name}</h3>
            <p>{typeLabels[monitor.type]} · {monitor.target.label}</p>
          </div>
          <button type="button" className="monitor-edit-dialog__close" aria-label="Close edit dialog" onClick={onCancel}><X size={16} /></button>
        </div>
        <div className="monitor-edit-dialog__grid">
          <label className="monitor-edit-dialog__name">Name<input name="name" defaultValue={monitor.name} required maxLength={80} /></label>
          <label>Interval<input name="interval_sec" type="number" min="30" defaultValue={monitor.interval_sec} required /></label>
          <label>Timeout<input name="timeout_sec" type="number" min="1" defaultValue={monitor.timeout_sec} required /></label>
          <label className="monitor-edit-dialog__toggle"><input name="public_visible" type="checkbox" defaultChecked={monitor.public_visible} /> <span>Public visible</span></label>
        </div>
        <p className="monitor-edit-dialog__note">Target and secret-like fields are not edited here.</p>
        <div className="node-dialog__actions monitor-edit-dialog__actions">
          <button type="button" className="node-action" onClick={onCancel}>Cancel Edit</button>
          <button type="submit" className="node-action node-action--primary" disabled={pending}>Save Monitor</button>
        </div>
      </form>
    </div>
  );
}

function MonitorDetailPage({ monitor, pending, onBack, onEdit, onPauseResume }: {
  readonly monitor: Monitor;
  readonly pending: boolean;
  readonly onBack: () => void;
  readonly onEdit: () => void;
  readonly onPauseResume: () => void;
}) {
  const pauseLabel = monitor.status === 'paused' ? 'Resume' : 'Pause';
  const detail = buildMonitorDetail(monitor);

  return (
    <section className="monitor-detail-page" aria-label={`${monitor.name} detail`}>
      <div className="monitor-detail-header">
        <div>
          <button type="button" className="monitor-detail-header__back" onClick={onBack}><ArrowLeft size={14} /> Monitors</button>
          <div className="monitor-detail-header__title">
            <h2>{monitor.name}</h2>
            <span className="monitor-detail-badge monitor-detail-badge--brand">{typeLabels[monitor.type]}</span>
            <StatusBadge status={monitor.status === 'unknown' ? 'paused' : monitor.status} />
            <span className="monitor-detail-header__seen"><Clock size={13} /> {formatRelativeTime(monitor.latest.checked_at)}</span>
          </div>
        </div>
        <div className="monitor-detail-header__actions">
          <button type="button" className="node-action" onClick={onEdit}>Edit</button>
          <button type="button" className="node-action" disabled={pending} onClick={onPauseResume}>{pauseLabel}</button>
        </div>
      </div>

      <div className="monitor-detail-metrics">
        <DetailMetric icon={<ShieldCheck size={17} />} label="Status" value={detail.status} tone={monitor.status} />
        <DetailMetric icon={<Gauge size={17} />} label="Ping" value={formatMetric(monitor.latest.latency_ms, 'ms')} empty={monitor.latest.latency_ms == null} />
        <DetailMetric icon={<Cpu size={17} />} label="CPU Usage" value={formatMetric(monitor.latest.cpu_percent, '%')} empty={monitor.latest.cpu_percent == null} />
        <DetailMetric icon={<MemoryStick size={17} />} label="Memory" value={formatMetric(monitor.latest.mem_percent, '%')} empty={monitor.latest.mem_percent == null} />
      </div>

      <div className="monitor-detail-grid">
        <div className="monitor-detail-column">
          <article className="card monitor-detail-card">
            <div className="monitor-detail-card__heading">
              <h3>Uptime history</h3>
              <select aria-label="Uptime range" defaultValue="90d"><option value="90d">90 days</option><option value="30d">30 days</option><option value="7d">7 days</option></select>
            </div>
            <div className="monitor-detail-uptime" aria-label="Mock uptime history">
              {detail.uptimeSegments.map((segment, index) => <span key={`${segment}-${index}`} className={`monitor-detail-uptime__bar monitor-detail-uptime__bar--${segment}`} />)}
            </div>
            <div className="monitor-detail-legend">
              <span className="monitor-detail-legend__up">Up</span>
              <span className="monitor-detail-legend__down">Down</span>
              <span className="monitor-detail-legend__no">No data</span>
              <strong>{formatUptime(monitor.latest.uptime_ratio)}</strong>
            </div>
          </article>

          <article className="card monitor-detail-card">
            <div className="monitor-detail-card__heading">
              <h3>Response time</h3>
              <span>Avg {detail.avgLatency} · P95 {detail.p95Latency} · Max {detail.maxLatency}</span>
            </div>
            <div className="monitor-detail-chart" role="img" aria-label="Mock response time trend">
              <svg viewBox="0 0 320 96" preserveAspectRatio="none" focusable="false" aria-hidden="true">
                <defs>
                  <linearGradient id={`response-area-${monitor.id}`} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#4f72b8" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#4f72b8" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                <path className="monitor-detail-chart__area" d={detail.responseChart.areaPath} fill={`url(#response-area-${monitor.id})`} />
                <polyline className="monitor-detail-chart__line" points={detail.responseChart.linePoints} />
                {detail.responseChart.points.map((point, index) => (
                  <circle key={`${point.x}-${point.y}-${index}`} className="monitor-detail-chart__point" cx={point.x} cy={point.y} r="2.6" />
                ))}
              </svg>
              <div className="monitor-detail-chart__axis">
                <span>24h ago</span>
                <span>now</span>
              </div>
            </div>
          </article>

          <article className="card monitor-detail-card">
            <div className="monitor-detail-card__heading">
              <h3>Configuration</h3>
            </div>
            <dl className="monitor-detail-config">
              {detail.config.map((item) => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
          </article>
        </div>

        <div className="monitor-detail-column">
          <article className="card monitor-detail-card">
            <div className="monitor-detail-card__heading">
              <h3>{monitor.type === 'agent' ? 'Docker containers' : 'Synthetic profile'}</h3>
            </div>
            <div className="monitor-detail-container-list">
              {detail.workloads.map((item) => (
                <div key={item.name} className="monitor-detail-container">
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.meta}</span>
                  </div>
                  <span className={`monitor-detail-badge monitor-detail-badge--${item.state === 'running' ? 'green' : 'gray'}`}>{item.state}</span>
                  <small>{item.stats}</small>
                </div>
              ))}
            </div>
          </article>

          <article className="card monitor-detail-card">
            <div className="monitor-detail-card__heading">
              <h3>Alert rules</h3>
              <span>{detail.alertRules.length} active</span>
            </div>
            <div className="monitor-detail-rule-list">
              {detail.alertRules.map((rule) => (
                <div key={rule.name} className="monitor-detail-rule">
                  <Bell size={15} />
                  <div>
                    <strong>{rule.name}</strong>
                    <span>{rule.channel}</span>
                  </div>
                  <span className="monitor-detail-toggle" aria-hidden="true" />
                </div>
              ))}
            </div>
          </article>

          <article className="card monitor-detail-card">
            <div className="monitor-detail-card__heading">
              <h3>Recent check results</h3>
            </div>
            <div className="monitor-detail-checks">
              {detail.checks.map((check) => (
                <div key={`${check.time}-${check.message}`} className="monitor-detail-check">
                  <span className={`monitor-detail-badge monitor-detail-badge--${check.status === 'UP' ? 'green' : 'red'}`}>{check.status}</span>
                  <time>{check.time}</time>
                  <span>{check.message}</span>
                </div>
              ))}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function DetailMetric({ icon, label, value, tone, empty = false }: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: string;
  readonly tone?: MonitorStatus;
  readonly empty?: boolean;
}) {
  return (
    <div className={`monitor-detail-metric ${empty ? 'monitor-detail-metric--empty' : ''} ${tone ? `monitor-detail-metric--${tone}` : ''}`}>
      <span aria-hidden="true">{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function Metric({ icon, label, value, empty = false }: { readonly icon: ReactNode; readonly label: string; readonly value: string; readonly empty?: boolean }) {
  return (
    <div className={`monitor-metric ${empty ? 'monitor-metric--empty' : ''}`}>
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MonitorForm({ mode, onCancel, onCreate }: {
  readonly mode: MonitorType;
  readonly onCancel: () => void;
  readonly onCreate: (payload: CreateMonitorRequest) => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    onCreate(buildPayload(mode, data));
    form.reset();
  };

  return (
    <form className="monitor-form card" aria-label="Monitor form" onSubmit={submit}>
      <div className="monitor-form__header">
        <div>
          <h2>{typeLabels[mode]}</h2>
          <p>{mode === 'agent' ? 'Create a v2 probe placeholder without exposing credentials.' : 'Create a scheduler-backed monitor.'}</p>
        </div>
        <button type="button" className="node-action" onClick={onCancel}>Cancel</button>
      </div>
      <label>Name<input name="name" required maxLength={80} /></label>
      {mode === 'http' && (
        <>
          <label>URL<input name="url" type="url" placeholder="https://example.com/health" required /></label>
          <label>Expected status<input name="expected_status" type="number" min="100" max="599" defaultValue="200" required /></label>
        </>
      )}
      {mode === 'tcp' && (
        <>
          <label>Host<input name="host" placeholder="db.example.com" required /></label>
          <label>Port<input name="port" type="number" min="1" max="65535" placeholder="5432" required /></label>
        </>
      )}
      <label>Interval<input name="interval_sec" type="number" min="30" defaultValue="300" required /></label>
      <label>Timeout<input name="timeout_sec" type="number" min="1" defaultValue="10" required /></label>
      <button type="submit" className="page-header__primary">Create Monitor</button>
    </form>
  );
}

function buildPayload(mode: MonitorType, data: FormData): CreateMonitorRequest {
  const base = {
    name: String(data.get('name') ?? ''),
    type: mode,
    interval_sec: Number(data.get('interval_sec')),
    timeout_sec: Number(data.get('timeout_sec')),
  };
  if (mode === 'http') {
    return { ...base, config: { url: String(data.get('url') ?? ''), expected_status: Number(data.get('expected_status')) } };
  }
  if (mode === 'tcp') {
    return { ...base, config: { host: String(data.get('host') ?? ''), port: Number(data.get('port')) } };
  }
  return { ...base, config: {} };
}

function formatMetric(value: number | null, suffix: string) {
  if (value == null) return noData;
  return `${Math.round(value * 10) / 10}${suffix}`;
}

function formatUptime(value: number | null) {
  if (value == null) return noData;
  const normalized = value <= 1 ? value * 100 : value;
  return `${Math.round(normalized * 10) / 10}%`;
}

function formatStatus(status: MonitorStatus) {
  if (status === 'unknown') return 'No result yet';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatRelativeTime(timestamp: number | null) {
  if (timestamp == null) return 'No checks yet';
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
  if (diff < 60) return 'Last seen just now';
  if (diff < 3600) return `Last seen ${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `Last seen ${Math.floor(diff / 3600)} hr ago`;
  return `Last seen ${Math.floor(diff / 86400)} d ago`;
}

function formatTimeOffset(offsetSeconds: number) {
  return new Date((Date.now() - offsetSeconds * 1000)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function buildMonitorDetail(monitor: Monitor) {
  const latency = monitor.latest.latency_ms;
  const isDown = monitor.status === 'offline';
  const isUnknown = monitor.status === 'unknown';
  const uptimeSegments: Array<'up' | 'down' | 'no'> = [
    'up', 'up', 'up', isDown ? 'down' : 'up', 'up', 'up', 'up', isUnknown ? 'no' : 'up', 'up', 'up',
    'up', 'up', monitor.status === 'degraded' ? 'down' : 'up', 'up', 'up', 'up', 'up', 'up', 'up', isUnknown ? 'no' : 'up',
    'up', 'up', 'up', 'up', 'up', 'up', 'up', 'up',
  ];

  return {
    status: formatStatus(monitor.status),
    avgLatency: latency == null ? noData : `${Math.round(latency)}ms`,
    p95Latency: latency == null ? noData : `${Math.round(latency * 1.45)}ms`,
    maxLatency: latency == null ? noData : `${Math.max(Math.round(latency * 3.8), Math.round(latency + 20))}ms`,
    uptimeSegments,
    responseChart: buildResponseChart(latency == null
      ? [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      : [latency - 3, latency - 2, latency + 4, latency - 1, latency + 7, latency + 2, latency - 4, latency + 5, latency + 1, latency + 9, latency + 3, latency + 6]),
    config: [
      { label: 'Monitor ID', value: monitor.id },
      { label: 'Backend', value: monitor.backend_label },
      { label: 'Target', value: monitor.target.label },
      { label: 'Interval', value: `${monitor.interval_sec}s` },
      { label: 'Timeout', value: `${monitor.timeout_sec}s` },
      { label: 'Public status', value: monitor.public_visible ? 'Visible' : 'Hidden' },
    ],
    workloads: monitor.type === 'agent' ? [
      { name: '/nginx', meta: 'peytonyip/nginx-brotli:latest', state: 'running', stats: 'CPU 2.6% · Mem 0.6%' },
      { name: '/dpanel', meta: 'dpanel/dpanel:latest', state: 'running', stats: 'CPU 0.1% · Mem 1.6%' },
      { name: '/certbot-dns', meta: 'certbot/dns-cloudflare:latest', state: 'running', stats: 'CPU 0% · Mem 0.1%' },
      { name: '/tm', meta: 'traffmonetizer/cli_v2:latest', state: 'exited', stats: noData },
    ] : [
      { name: monitor.type === 'http' ? 'HTTP scheduler' : 'TCP scheduler', meta: monitor.target.label, state: 'running', stats: `Every ${monitor.interval_sec}s` },
      { name: 'Regional probe', meta: 'Default backend', state: 'running', stats: `${monitor.timeout_sec}s timeout` },
      { name: 'Public status', meta: monitor.visibility.public ? 'Published' : 'Private', state: monitor.public_visible ? 'running' : 'paused', stats: monitor.visibility.show_latency ? 'Latency visible' : 'Latency hidden' },
    ],
    alertRules: [
      { name: monitor.status === 'offline' ? 'Monitor recovery' : 'Monitor offline', channel: 'Telegram + Webhook' },
      { name: monitor.type === 'agent' ? 'CPU > 80%' : 'Latency > 2000ms', channel: 'Webhook' },
    ],
    checks: isUnknown ? [
      { status: 'DOWN', time: formatTimeOffset(600), message: 'no result yet' },
      { status: 'DOWN', time: formatTimeOffset(900), message: 'waiting for first check' },
    ] : [
      { status: isDown ? 'DOWN' : 'UP', time: formatTimeOffset(60), message: isDown ? 'timeout · connection refused' : formatMetric(latency, 'ms') },
      { status: 'UP', time: formatTimeOffset(120), message: latency == null ? noData : `${Math.max(1, Math.round(latency - 2))}ms` },
      { status: monitor.status === 'degraded' ? 'DOWN' : 'UP', time: formatTimeOffset(180), message: monitor.status === 'degraded' ? 'slow response' : latency == null ? noData : `${Math.round(latency + 1)}ms` },
      { status: 'UP', time: formatTimeOffset(240), message: latency == null ? noData : `${Math.round(latency + 3)}ms` },
    ],
  };
}

function buildResponseChart(values: ReadonlyArray<number>) {
  const width = 320;
  const height = 96;
  const paddingX = 6;
  const paddingY = 12;
  const sanitized = values.map((value) => Math.max(0, value));
  const max = Math.max(...sanitized, 1);
  const min = Math.min(...sanitized, 0);
  const range = Math.max(max - min, 1);
  const points = sanitized.map((value, index) => {
    const x = paddingX + (index * (width - paddingX * 2)) / Math.max(sanitized.length - 1, 1);
    const y = height - paddingY - ((value - min) / range) * (height - paddingY * 2);
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  });
  const linePoints = points.map((point) => `${point.x},${point.y}`).join(' ');
  const areaPath = points.length
    ? `M ${points[0].x} ${height - paddingY} L ${points.map((point) => `${point.x} ${point.y}`).join(' L ')} L ${points[points.length - 1].x} ${height - paddingY} Z`
    : '';
  return { areaPath, linePoints, points };
}
