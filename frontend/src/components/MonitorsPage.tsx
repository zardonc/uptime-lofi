import { useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Activity, Cpu, Gauge, MemoryStick, Plus, Search, Trash2 } from 'lucide-react';
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

  return (
    <div className="dashboard monitors-page">
      <header className="dashboard-header animate-in" role="banner">
        <div>
          <h1>Monitors</h1>
          <p className="subtitle">Unified management for agent probes, HTTP checks, and TCP checks</p>
        </div>
        <div className="page-header__actions monitors-page__add-actions">
          <button type="button" className="page-header__primary" onClick={() => setFormMode(formMode ? null : 'http')}><Plus size={18} />Add Monitor</button>
          <button type="button" className="node-action" onClick={() => setFormMode('agent')}>Agent Probe</button>
          <button type="button" className="node-action" onClick={() => setFormMode('http')}>HTTP Check</button>
          <button type="button" className="node-action" onClick={() => setFormMode('tcp')}>TCP Check</button>
        </div>
      </header>

      {error && <ErrorBanner message={error} onRetry={refetch} />}
      {saveError && <p className="agentless-form__error" role="alert">{saveError}</p>}
      {formMode && <MonitorForm mode={formMode} onCancel={() => setFormMode(null)} onCreate={(payload) => void handleCreate(payload)} />}

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
              onDelete={() => setDeleteTarget(monitor)}
            />
          ))}
        </section>
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
        <div className="node-dialog" role="presentation">
          <form className="node-dialog__panel" role="dialog" aria-modal="true" aria-label={`Edit ${editTarget.name}`} onSubmit={(event) => void handleEdit(event)}>
            <h3>Edit {editTarget.name}</h3>
            <label>Name<input name="name" defaultValue={editTarget.name} required maxLength={80} /></label>
            <label>Interval<input name="interval_sec" type="number" min="30" defaultValue={editTarget.interval_sec} required /></label>
            <label>Timeout<input name="timeout_sec" type="number" min="1" defaultValue={editTarget.timeout_sec} required /></label>
            <label className="monitor-form__checkbox"><input name="public_visible" type="checkbox" defaultChecked={editTarget.public_visible} /> Public visible</label>
            <p>Target and secret-like fields are not edited here.</p>
            <div className="node-dialog__actions">
              <button type="button" className="node-action" onClick={() => setEditTarget(null)}>Cancel Edit</button>
              <button type="submit" className="node-action" disabled={pendingId === editTarget.id}>Save Monitor</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function MonitorCard({ monitor, pending, onEdit, onPauseResume, onDelete }: {
  readonly monitor: Monitor;
  readonly pending: boolean;
  readonly onEdit: () => void;
  readonly onPauseResume: () => void;
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
        <button type="button" className="node-action">Details</button>
        <button type="button" className="node-action node-action--danger" onClick={onDelete}>Delete</button>
      </div>
    </article>
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
