import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Activity, ArrowLeft, ChevronDown, Clock, Cpu, Gauge, MemoryStick, Plus, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import { api, ApiClientError } from '../api/client';
import type { CreateMonitorRequest, Monitor, MonitorStatus, MonitorType, ProbeConfigData, ProbePlatform } from '../api/types';
import { useAuth } from '../hooks/useAuth';
import { useMonitors } from '../hooks/useMonitors';
import { ErrorBanner } from './ErrorBanner';
import { StatusBadge } from './StatusBadge';

type FormMode = MonitorType | null;
type ProbeCommandResult = {
  readonly platform: ProbePlatform;
  readonly config: ProbeConfigData;
};
type MonitorDetailWorkload = {
  readonly name: string;
  readonly meta: string;
  readonly state: 'running' | 'paused' | 'exited';
  readonly stats: string;
};
type MonitorDetailRule = {
  readonly name: string;
  readonly channel: string;
};
type MonitorDetailCheck = {
  readonly status: 'UP' | 'DOWN';
  readonly time: string;
  readonly message: string;
};

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
  const [probeCommand, setProbeCommand] = useState<ProbeCommandResult | null>(null);
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
  const hasActiveFilters = query.trim().length > 0 || typeFilter !== 'all' || statusFilter !== 'all';

  const clearFilters = () => {
    setQuery('');
    setTypeFilter('all');
    setStatusFilter('all');
  };

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

  const handleCreateProbe = async (payload: { readonly name: string; readonly platform: ProbePlatform; readonly public_visible: boolean }) => {
    try {
      setSaveError(null);
      const response = await api.createProbeConfig(payload);
      setProbeCommand({ platform: payload.platform, config: response.data });
      setFormMode('agent');
      void refetch();
    } catch (err) {
      setSaveError(probeConfigErrorMessage(err));
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
    setProbeCommand(null);
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
      {formMode && (
        <MonitorForm
          mode={formMode}
          probeCommand={probeCommand}
          onCancel={() => {
            setFormMode(null);
            setProbeCommand(null);
          }}
          onCreate={(payload) => void handleCreate(payload)}
          onCreateProbe={(payload) => void handleCreateProbe(payload)}
        />
      )}

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
          ) : monitors.length === 0 ? (
            <section className="card monitors-empty"><h2>No monitors yet</h2><p>Create an agent probe, HTTP check, or TCP check to start building the v2 monitor domain.</p></section>
          ) : filtered.length === 0 ? (
            <section className="card monitors-empty">
              <h2>No monitors match</h2>
              <p>Adjust the current search or filters to see existing monitors.</p>
              {hasActiveFilters && <button type="button" className="monitor-action" onClick={clearFilters}>Clear Filters</button>}
            </section>
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
        <div className="monitor-dialog" role="presentation">
          <div className="monitor-dialog__panel" role="dialog" aria-modal="true" aria-label={`Delete ${deleteTarget.name}?`}>
            <h3>Delete {deleteTarget.name}?</h3>
            <p>Historical results stay available for reports. The monitor leaves active management.</p>
            <div className="monitor-dialog__actions">
              <button type="button" className="monitor-action" onClick={() => setDeleteTarget(null)}>Keep Monitor</button>
              <button type="button" className="monitor-action monitor-action--danger" disabled={pendingId === deleteTarget.id} onClick={() => void handleArchive()}><Trash2 size={16} /> Delete Monitor</button>
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
        <div className="monitor-status-stack">
          <StatusBadge status={monitor.status} />
          {isReachable403(monitor.latest.status_code) && <Reachable403Badge />}
        </div>
      </div>
      <div className="monitor-card__metrics">
        <Metric icon={<Activity size={17} />} label="Status" value={monitor.status === 'unknown' ? 'No result yet' : monitor.status} />
        <Metric icon={<Gauge size={17} />} label="Latency" value={formatMetric(monitor.latest.latency_ms, 'ms')} empty={monitor.latest.latency_ms == null} />
        <Metric icon={<Cpu size={17} />} label="CPU" value={formatMetric(monitor.latest.cpu_percent, '%')} empty={monitor.latest.cpu_percent == null} />
        <Metric icon={<MemoryStick size={17} />} label="Memory" value={formatMetric(monitor.latest.mem_percent, '%')} empty={monitor.latest.mem_percent == null} />
      </div>
      <div className="monitor-card__actions">
        <button type="button" className="monitor-action" onClick={onEdit}>Edit</button>
        <button type="button" className="monitor-action" disabled={pending} onClick={onPauseResume}>{pauseLabel}</button>
        <button type="button" className="monitor-action monitor-action--primary" onClick={onDetails}>Details</button>
        <button type="button" className="monitor-action monitor-action--danger" onClick={onDelete}>Delete</button>
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
    <div className="monitor-dialog monitor-edit-dialog-shell" role="presentation">
      <form className="monitor-dialog__panel monitor-edit-dialog" role="dialog" aria-modal="true" aria-label={`Edit ${monitor.name}`} onSubmit={onSubmit}>
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
        <div className="monitor-dialog__actions monitor-edit-dialog__actions">
          <button type="button" className="monitor-action" onClick={onCancel}>Cancel Edit</button>
          <button type="submit" className="monitor-action monitor-action--primary" disabled={pending}>Save Monitor</button>
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
            <StatusBadge status={monitor.status} />
            {isReachable403(monitor.latest.status_code) && <Reachable403Badge />}
            <span className="monitor-detail-header__seen"><Clock size={13} /> {formatRelativeTime(monitor.latest.checked_at)}</span>
          </div>
        </div>
        <div className="monitor-detail-header__actions">
          <button type="button" className="monitor-action" onClick={onEdit}>Edit</button>
          <button type="button" className="monitor-action" disabled={pending} onClick={onPauseResume}>{pauseLabel}</button>
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
            {detail.hasCheckData ? (
              <>
                <div className="monitor-detail-uptime" aria-label="Latest uptime state">
                  {detail.uptimeSegments.map((segment, index) => <span key={`${segment}-${index}`} className={`monitor-detail-uptime__bar monitor-detail-uptime__bar--${segment}`} />)}
                </div>
                <div className="monitor-detail-legend">
                  <span className="monitor-detail-legend__up">Up</span>
                  <span className="monitor-detail-legend__down">Down</span>
                  <span className="monitor-detail-legend__no">No data</span>
                  <strong>{formatUptime(monitor.latest.uptime_ratio)}</strong>
                </div>
              </>
            ) : (
              <EmptyDetailState title="No uptime history yet" detail="History appears after this monitor records checks." />
            )}
          </article>

          <article className="card monitor-detail-card">
            <div className="monitor-detail-card__heading">
              <h3>Response time</h3>
              <span>Avg {detail.avgLatency} · P95 {detail.p95Latency} · Max {detail.maxLatency}</span>
            </div>
            <EmptyDetailState
              title={detail.hasCheckData ? 'Historical trend unavailable' : 'No response samples yet'}
              detail={detail.hasCheckData ? 'Only the latest sample is available locally.' : 'Response time appears after checks have been recorded.'}
            />
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
              <h3>{monitor.type === 'agent' ? 'Docker containers' : 'Runtime data'}</h3>
            </div>
            {detail.workloads.length === 0 ? (
              <EmptyDetailState title="No runtime data yet" detail="Runtime details appear after an agent report or scheduled check stores data." />
            ) : (
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
            )}
          </article>

          <article className="card monitor-detail-card">
            <div className="monitor-detail-card__heading">
              <h3>Alert rules</h3>
              <span>{detail.alertRules.length} linked</span>
            </div>
            {detail.alertRules.length === 0 ? (
              <EmptyDetailState title="No linked alert rules" detail="Rules created for this monitor will appear here when the detail API exposes them." />
            ) : (
              <div className="monitor-detail-rule-list">
                {detail.alertRules.map((rule) => (
                <div key={rule.name} className="monitor-detail-rule">
                  <div>
                    <strong>{rule.name}</strong>
                    <span>{rule.channel}</span>
                  </div>
                  <span className="monitor-detail-toggle" aria-hidden="true" />
                </div>
                ))}
              </div>
            )}
          </article>

          <article className="card monitor-detail-card">
            <div className="monitor-detail-card__heading">
              <h3>Recent check results</h3>
            </div>
            {detail.checks.length === 0 ? (
              <EmptyDetailState title="No check results yet" detail="The latest check result will appear after the scheduler or probe writes data." />
            ) : (
              <div className="monitor-detail-checks">
                {detail.checks.map((check) => (
                <div key={`${check.time}-${check.message}`} className="monitor-detail-check">
                  <span className={`monitor-detail-badge monitor-detail-badge--${check.status === 'UP' ? 'green' : 'red'}`}>{check.status}</span>
                  <time>{check.time}</time>
                  <span>{check.message}</span>
                </div>
                ))}
              </div>
            )}
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

function EmptyDetailState({ title, detail }: { readonly title: string; readonly detail: string }) {
  return (
    <div className="monitor-detail-empty">
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

function Reachable403Badge() {
  return (
    <span className="reachable-403-badge" title="403 reachable" aria-label="403 reachable">
      403
    </span>
  );
}

function isReachable403(statusCode: number | null | undefined): boolean {
  return statusCode === 403;
}

function probeConfigErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 409) return 'A monitor with this name already exists. Choose another name.';
    if (error.status === 401 || error.status === 403) return 'Your session expired. Sign in again before generating the probe command.';
    if (error.status >= 500) return error.message || 'Could not create the probe install command. Check backend probe configuration and try again.';
    return error.message;
  }
  return 'Could not create the probe install command. Try again.';
}

const probePlatforms: ReadonlyArray<ProbePlatform> = ['linux/amd64', 'linux/arm64', 'darwin/amd64', 'darwin/arm64'];

const probePlatformLabels: Readonly<Record<ProbePlatform, string>> = {
  'linux/amd64': 'Linux amd64',
  'linux/arm64': 'Linux arm64',
  'darwin/amd64': 'macOS amd64',
  'darwin/arm64': 'macOS arm64',
};

function MonitorForm({ mode, probeCommand, onCancel, onCreate, onCreateProbe }: {
  readonly mode: MonitorType;
  readonly probeCommand: ProbeCommandResult | null;
  readonly onCancel: () => void;
  readonly onCreate: (payload: CreateMonitorRequest) => void;
  readonly onCreateProbe: (payload: { readonly name: string; readonly platform: ProbePlatform; readonly public_visible: boolean }) => void;
}) {
  const [commandCopied, setCommandCopied] = useState(false);
  const [configCopied, setConfigCopied] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const selectedDownload = probeCommand?.config.downloads[probeCommand.platform.replace('/', '_') as keyof ProbeConfigData['downloads']];

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (mode === 'agent') {
      onCreateProbe({
        name: String(data.get('name') ?? ''),
        platform: String(data.get('platform') ?? 'linux/amd64') as ProbePlatform,
        public_visible: data.get('public_visible') === 'on',
      });
      return;
    }
    onCreate(buildPayload(mode, data));
    form.reset();
  };

  const copyCommand = async () => {
    if (!probeCommand) return;
    await navigator.clipboard.writeText(probeCommand.config.install_command);
    setCommandCopied(true);
  };

  const copyConfig = async () => {
    if (!probeCommand) return;
    await navigator.clipboard.writeText(probeCommand.config.config_yaml);
    setConfigCopied(true);
  };

  const downloadConfig = () => {
    if (!probeCommand) return;
    const url = URL.createObjectURL(new Blob([probeCommand.config.config_yaml], { type: 'text/yaml' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'config.yaml';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <form className="monitor-form card" aria-label="Monitor form" onSubmit={submit}>
      <div className="monitor-form__header">
        <div>
          <h2>{typeLabels[mode]}</h2>
          <p>{mode === 'agent' ? 'Create the probe monitor and generate its install command.' : 'Create a scheduler-backed monitor.'}</p>
        </div>
        <button type="button" className="monitor-action" onClick={onCancel}>Cancel</button>
      </div>
      <label>Name<input name="name" required maxLength={80} /></label>
      {mode === 'agent' && (
        <>
          <label>Platform
            <select name="platform" defaultValue="linux/amd64">
              {probePlatforms.map((value) => (
                <option key={value} value={value}>{probePlatformLabels[value]}</option>
              ))}
            </select>
          </label>
          <label className="monitor-form__checkbox">
            <input name="public_visible" type="checkbox" defaultChecked />
            <span>Public visible</span>
          </label>
        </>
      )}
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
      {mode !== 'agent' && (
        <>
          <label>Interval<input name="interval_sec" type="number" min="30" defaultValue="300" required /></label>
          <label>Timeout<input name="timeout_sec" type="number" min="1" defaultValue="10" required /></label>
        </>
      )}
      <button type="submit" className="page-header__primary">{mode === 'agent' ? 'Create Probe & Generate Command' : 'Create Monitor'}</button>
      {probeCommand && (
        <div className="probe-setup monitor-form__probe-result">
          <div className="probe-setup__result">
            <article className="probe-setup__command-card">
              <div className="probe-setup__command-header">
                <h3>Run this on your server</h3>
                <button type="button" onClick={copyCommand}>Copy Command</button>
              </div>
              <pre className="probe-setup__code" data-testid="probe-install-command">{probeCommand.config.install_command}</pre>
              {commandCopied && <p className="probe-setup__copied">Command copied</p>}
              <p className="probe-setup__notice">
                This command uses a monitor-specific credential. It never includes your master API secret.
              </p>
              <p className="probe-setup__hint">
                The monitor has been created. Run the command on your server, then wait for the first probe report.
              </p>
            </article>

            <button
              type="button"
              className="probe-setup__manual-toggle"
              aria-expanded={showManual}
              aria-controls="probe-manual-setup"
              onClick={() => setShowManual((current) => !current)}
            >
              Show Manual Setup
            </button>

            {showManual && (
              <section id="probe-manual-setup" className="probe-setup__manual" role="region" aria-label="Manual setup">
                <h3>Manual setup</h3>
                <p>Use this if the one-command installer cannot run on your server. Download the matching binary, save config.yaml beside it, then start the probe.</p>

                <dl className="probe-setup__details">
                  <div>
                    <dt>Monitor ID</dt>
                    <dd>{probeCommand.config.monitor_id}</dd>
                  </div>
                  <div>
                    <dt>Probe Push URL</dt>
                    <dd>{probeCommand.config.probe_push_url}</dd>
                  </div>
                  <div>
                    <dt>Monitor Credential</dt>
                    <dd>{probeCommand.config.monitor_secret}</dd>
                  </div>
                </dl>

                <div className="probe-setup__downloads">
                  <h4>Download Probe Binary</h4>
                  {selectedDownload && (
                    <a href={selectedDownload} rel="noreferrer" target="_blank">Recommended for {probePlatformLabels[probeCommand.platform]}</a>
                  )}
                  <div className="probe-setup__download-grid">
                    {Object.entries(probeCommand.config.downloads).map(([key, href]) => (
                      <a key={key} href={href} rel="noreferrer" target="_blank">{key.replace('_', ' ')}</a>
                    ))}
                  </div>
                </div>

                <div className="probe-setup__config-header">
                  <h4>config.yaml</h4>
                  <div>
                    <button type="button" onClick={copyConfig}>Copy Config</button>
                    <button type="button" onClick={downloadConfig}>Download config.yaml</button>
                  </div>
                </div>
                {configCopied && <p className="probe-setup__copied">Copied config.yaml</p>}
                <pre className="probe-setup__code">{probeCommand.config.config_yaml}</pre>
              </section>
            )}
          </div>
        </div>
      )}
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

function buildMonitorDetail(monitor: Monitor) {
  const latency = monitor.latest.latency_ms;
  const hasCheckData = monitor.latest.checked_at !== null;
  const latestState = monitor.status === 'online' ? 'up' : monitor.status === 'offline' || monitor.status === 'degraded' ? 'down' : 'no';
  const workloads: MonitorDetailWorkload[] = (monitor.latest.containers ?? []).map((container) => {
    const name = normalizeContainerName(container.name ?? container.id ?? 'Container');
    const state = normalizeContainerState(container.state);
    const stats = container.cpu_percent == null && container.mem_percent == null
      ? 'No resource sample'
      : `CPU ${formatMetric(container.cpu_percent ?? null, '%')} · MEM ${formatMetric(container.mem_percent ?? null, '%')}`;
    return {
      name,
      meta: container.image ?? container.status ?? noData,
      state,
      stats,
    };
  });
  const alertRules: MonitorDetailRule[] = [];
  const checks: MonitorDetailCheck[] = hasCheckData ? [{
    status: monitor.status === 'online' ? 'UP' : 'DOWN',
    time: 'Latest',
    message: monitor.latest.error_text ?? formatMetric(latency, 'ms'),
  }] : [];
  const uptimeSegments: Array<'up' | 'down' | 'no'> = [
    'no', 'no', 'no', 'no', 'no', 'no', 'no', 'no', 'no', 'no',
    'no', 'no', 'no', 'no', 'no', 'no', 'no', 'no', 'no', 'no',
    'no', 'no', 'no', 'no', 'no', 'no', 'no', latestState,
  ];

  return {
    hasCheckData,
    status: formatStatus(monitor.status),
    avgLatency: latency == null ? noData : `${Math.round(latency)}ms`,
    p95Latency: noData,
    maxLatency: noData,
    uptimeSegments,
    config: [
      { label: 'Monitor ID', value: monitor.id },
      { label: 'Backend', value: monitor.backend_label },
      { label: 'Target', value: monitor.target.label },
      { label: 'Interval', value: `${monitor.interval_sec}s` },
      { label: 'Timeout', value: `${monitor.timeout_sec}s` },
      { label: 'Public status', value: monitor.public_visible ? 'Visible' : 'Hidden' },
    ],
    workloads,
    alertRules,
    checks,
  };
}

function normalizeContainerName(name: string) {
  const trimmed = name.trim();
  return trimmed.startsWith('/') ? trimmed.slice(1) || trimmed : trimmed;
}

function normalizeContainerState(state: string | undefined): MonitorDetailWorkload['state'] {
  if (state === 'running') return 'running';
  if (state === 'paused') return 'paused';
  return 'exited';
}

