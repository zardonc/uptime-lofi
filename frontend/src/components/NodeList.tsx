import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity,
  CircleCheck,
  CircleHelp,
  CircleOff,
  Clock,
  Cpu,
  Gauge,
  MemoryStick,
  MoreHorizontal,
  PauseCircle,
  TriangleAlert,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import type { ApiContainerMetric, ApiMetric, ApiNode, NodeStatus, NodeType } from '../api/types';
import { StatusBadge } from './StatusBadge';

const noData = '--';

interface NodeListProps {
  readonly nodes: ReadonlyArray<ApiNode>;
  readonly onRefresh?: () => void;
  readonly showManagement?: boolean;
}

interface MetricDisplay {
  readonly value: string;
  readonly label: string;
  readonly hasData: boolean;
}

const typeLabels: Record<NodeType, string> = {
  agent_push: 'Agent Probe',
  agentless_http: 'HTTP',
  agentless_tcp: 'TCP',
};

function configValue(config: Record<string, unknown>, primary: string, fallback: string) {
  return config[primary] ?? config[fallback] ?? noData;
}

function formatHeartbeat(epoch: number | null): string {
  if (epoch == null) return 'No heartbeat yet';
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - epoch);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatPercent(value: number | null): MetricDisplay {
  if (value == null) return { value: noData, label: 'no data yet', hasData: false };
  const rounded = Math.round(value * 10) / 10;
  return { value: `${rounded.toFixed(1)}%`, label: `${rounded} percent`, hasData: true };
}

function formatPing(value: number | null): MetricDisplay {
  if (value == null || value <= 0) return { value: noData, label: 'no data yet', hasData: false };
  return { value: `${value}ms`, label: `${value} milliseconds`, hasData: true };
}

function statusIcon(status: NodeStatus) {
  if (status === 'online') return <CircleCheck size={18} />;
  if (status === 'degraded') return <TriangleAlert size={18} />;
  if (status === 'offline') return <CircleOff size={18} />;
  if (status === 'paused') return <PauseCircle size={18} />;
  return <CircleHelp size={18} />;
}

function latestMetric(metrics: ReadonlyArray<ApiMetric>): ApiMetric | null {
  if (metrics.length === 0) return null;
  return [...metrics].sort((a, b) => b.timestamp - a.timestamp)[0];
}

function containerName(container: ApiContainerMetric): string {
  return container.name || container.id || 'Unnamed container';
}

function configSummary(node: ApiNode): ReadonlyArray<[string, string]> {
  const config = (node.config ?? {}) as Record<string, unknown>;
  if (node.type === 'agentless_http') {
    return [
      ['URL', String(config.url ?? noData)],
      ['Interval', `${String(configValue(config, 'interval', 'interval_seconds'))}s`],
      ['Timeout', `${String(configValue(config, 'timeout', 'timeout_seconds'))}s`],
      ['Expected status', String(config.expected_status ?? noData)],
    ];
  }
  if (node.type === 'agentless_tcp') {
    return [
      ['Host', String(config.host ?? noData)],
      ['Port', String(config.port ?? noData)],
      ['Interval', `${String(configValue(config, 'interval', 'interval_seconds'))}s`],
      ['Timeout', `${String(configValue(config, 'timeout', 'timeout_seconds'))}s`],
    ];
  }
  return [
    ['Node ID', node.id],
    ['Probe push URL', String(config.probe_push_url ?? noData)],
    ['Platform', String(config.platform ?? noData)],
    ['Docker enabled', String(config.enable_docker ?? noData)],
  ];
}

function editableConfig(node: ApiNode) {
  return (node.config ?? {}) as Record<string, unknown>;
}

function numberField(value: FormDataEntryValue | null) {
  return Number(value);
}

function buildEditPayload(node: ApiNode, formData: FormData) {
  const name = String(formData.get('name') ?? '').trim();
  if (node.type === 'agentless_http') {
    return {
      name,
      config: {
        url: String(formData.get('url') ?? ''),
        interval: numberField(formData.get('interval')),
        timeout: numberField(formData.get('timeout')),
        expected_status: numberField(formData.get('expected_status')),
      },
    };
  }
  if (node.type === 'agentless_tcp') {
    return {
      name,
      config: {
        host: String(formData.get('host') ?? ''),
        port: numberField(formData.get('port')),
        interval: numberField(formData.get('interval')),
        timeout: numberField(formData.get('timeout')),
      },
    };
  }
  return { name };
}

export function NodeList({ nodes, onRefresh, showManagement = true }: NodeListProps) {
  const [selected, setSelected] = useState<ApiNode | null>(null);
  const [metrics, setMetrics] = useState<ReadonlyArray<ApiMetric>>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ApiNode | null>(null);
  const [editNode, setEditNode] = useState<ApiNode | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const metric = useMemo(() => latestMetric(metrics), [metrics]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setMetricsLoading(true);
    setDrawerError(null);
    api.getMetrics(selected.id, 24)
      .then((response) => { if (!cancelled) setMetrics(response.data); })
      .catch((error: Error) => { if (!cancelled) setDrawerError(error.message); })
      .finally(() => { if (!cancelled) setMetricsLoading(false); });
    return () => { cancelled = true; };
  }, [selected]);

  useEffect(() => {
    if (!selected && !confirmDelete) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelected(null);
        setConfirmDelete(null);
      }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [selected, confirmDelete]);

  const refresh = () => onRefresh?.();
  const pauseOrResume = async (node: ApiNode) => {
    const status = node.status === 'paused' ? 'offline' : 'paused';
    setPendingId(node.id);
    try {
      await api.updateNode(node.id, { status });
      refresh();
      setSelected((current) => current?.id === node.id ? { ...current, status } : current);
    } finally {
      setPendingId(null);
    }
  };

  const saveEdit = async (node: ApiNode, formData: FormData) => {
    setPendingId(node.id);
    try {
      const response = await api.updateNode(node.id, buildEditPayload(node, formData));
      setEditNode(null);
      setSelected((current) => current?.id === node.id ? { ...current, ...response.data } : current);
      refresh();
    } finally {
      setPendingId(null);
    }
  };

  const deleteNode = async () => {
    if (!confirmDelete) return;
    setPendingId(confirmDelete.id);
    try {
      await api.deleteNode(confirmDelete.id);
      setConfirmDelete(null);
      setSelected(null);
      refresh();
    } finally {
      setPendingId(null);
    }
  };

  if (nodes.length === 0) {
    return (
      <section className="card node-list" role="region" aria-label="Monitored nodes">
        <h3 className="section-title">Monitored nodes</h3>
        <div className="node-list__empty">
          <h4>No nodes yet</h4>
          <p>Add an agent probe or create an agentless check to start monitoring.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="card node-list" role="region" aria-label="Monitored nodes">
      <h3 className="section-title">Monitored nodes</h3>
      <div className="node-list__cards">
        {nodes.map((node) => (
          <NodeCard
            key={node.id}
            node={node}
            pending={pendingId === node.id}
            showManagement={showManagement}
            menuOpen={openMenuId === node.id}
            onMenu={() => setOpenMenuId(openMenuId === node.id ? null : node.id)}
            onDetails={() => setSelected(node)}
            onEdit={() => setEditNode(node)}
            onDelete={() => { setConfirmDelete(node); setOpenMenuId(null); }}
            onPauseResume={() => void pauseOrResume(node)}
          />
        ))}
      </div>

      {selected && (
        <NodeDetailDrawer
          node={selected}
          metric={metric}
          loading={metricsLoading}
          error={drawerError}
          pending={pendingId === selected.id}
          onClose={() => setSelected(null)}
          onEdit={() => setEditNode(selected)}
          onDelete={() => setConfirmDelete(selected)}
          onPauseResume={() => void pauseOrResume(selected)}
        />
      )}

      {confirmDelete && (
        <DeleteDialog
          node={confirmDelete}
          pending={pendingId === confirmDelete.id}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void deleteNode()}
        />
      )}

      {editNode && (
        <EditDialog
          node={editNode}
          pending={pendingId === editNode.id}
          onCancel={() => setEditNode(null)}
          onSave={(formData) => void saveEdit(editNode, formData)}
        />
      )}
    </section>
  );
}

interface NodeCardProps {
  readonly node: ApiNode;
  readonly pending: boolean;
  readonly showManagement: boolean;
  readonly menuOpen: boolean;
  readonly onMenu: () => void;
  readonly onDetails: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  readonly onPauseResume: () => void;
}

function NodeCard(props: NodeCardProps) {
  const ping = formatPing(props.node.ping_ms);
  const cpu = formatPercent(props.node.cpu_usage);
  const mem = formatPercent(props.node.mem_usage);
  const menuId = `node-actions-${props.node.id}`;
  const pauseLabel = props.node.status === 'paused' ? 'Resume' : 'Pause';

  return (
    <article className={`node-card node-card--${props.node.status}`}>
      <div className="node-card__identity">
        <div>
          <h4>{props.node.name}</h4>
          <div className="node-card__meta">
            <span className="node-card__type">{typeLabels[props.node.type]}</span>
            <StatusBadge status={props.node.status} />
          </div>
        </div>
        <p className="node-card__last-seen">Last seen: {formatHeartbeat(props.node.last_heartbeat)}</p>
      </div>
      <div className="node-card__metrics">
        <MetricCell icon={statusIcon(props.node.status)} label={`Status: ${props.node.status}`} value={props.node.status} hasData />
        <MetricCell icon={<Gauge size={18} />} label={`Ping: ${ping.label}`} value={ping.value} hasData={ping.hasData} />
        <MetricCell icon={<Cpu size={18} />} label={`CPU usage: ${cpu.label}`} value={cpu.value} hasData={cpu.hasData} />
        <MetricCell icon={<MemoryStick size={18} />} label={`Memory usage: ${mem.label}`} value={mem.value} hasData={mem.hasData} />
      </div>
      {props.showManagement && (
        <div className="node-card__actions">
          <button type="button" className="node-action" disabled={props.pending} onClick={props.onEdit}>Edit</button>
          <button type="button" className="node-action" disabled={props.pending} onClick={props.onPauseResume}>{pauseLabel}</button>
          <button type="button" className="node-action" onClick={props.onDetails}>View Details</button>
          <div className="node-card__menu-wrap">
            <button
              type="button"
              className="node-action node-action--icon"
              aria-label="More actions"
              aria-expanded={props.menuOpen}
              aria-controls={menuId}
              onClick={props.onMenu}
              title="More actions"
            >
              <MoreHorizontal size={18} />
            </button>
            {props.menuOpen && (
              <div id={menuId} className="node-card__menu" role="menu">
                <button type="button" role="menuitem" onClick={props.onDelete}>Delete</button>
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function MetricCell({ icon, label, value, hasData }: { readonly icon: ReactNode; readonly label: string; readonly value: string; readonly hasData: boolean }) {
  return (
    <div className={`node-metric ${hasData ? '' : 'node-metric--empty'}`} aria-label={label} title={hasData ? label : 'No data yet'}>
      <span className="node-metric__icon" aria-hidden="true">{icon}</span>
      <span className="node-metric__label">{label.split(':')[0]}</span>
      <span className="node-metric__value">{value}</span>
    </div>
  );
}

function NodeDetailDrawer({ node, metric, loading, error, pending, onClose, onEdit, onDelete, onPauseResume }: {
  readonly node: ApiNode;
  readonly metric: ApiMetric | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly pending: boolean;
  readonly onClose: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  readonly onPauseResume: () => void;
}) {
  const ping = formatPing(metric?.ping_ms ?? node.ping_ms);
  const cpu = formatPercent(metric?.cpu_percent ?? node.cpu_usage);
  const mem = formatPercent(metric?.mem_percent ?? node.mem_usage);
  const containers = metric?.containers ?? [];
  const pauseLabel = node.status === 'paused' ? 'Resume' : 'Pause';

  return (
    <div className="node-drawer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="node-drawer__panel" role="dialog" aria-modal="true" aria-label={`${node.name} details`}>
        <header className="node-drawer__header">
          <div>
            <h3 id="node-detail-title">{node.name}</h3>
            <div className="node-card__meta">
              <span className="node-card__type">{typeLabels[node.type]}</span>
              <StatusBadge status={node.status} />
            </div>
            <p><Clock size={16} aria-hidden="true" /> Last seen: {formatHeartbeat(node.last_heartbeat)}</p>
          </div>
          <button type="button" className="node-drawer__close" aria-label="Close details" onClick={onClose}><X size={18} /></button>
        </header>
        <section className="node-drawer__section">
          <h4>Current metrics</h4>
          {loading && <p className="node-drawer__muted">Loading latest metrics...</p>}
          {error && <p className="node-drawer__error">{error}</p>}
          <div className="node-drawer__metrics">
            <MetricCell icon={<Activity size={18} />} label={`Status: ${node.status}`} value={node.status} hasData />
            <MetricCell icon={<Gauge size={18} />} label={`Ping: ${ping.label}`} value={ping.value} hasData={ping.hasData} />
            <MetricCell icon={<Cpu size={18} />} label={`CPU usage: ${cpu.label}`} value={cpu.value} hasData={cpu.hasData} />
            <MetricCell icon={<MemoryStick size={18} />} label={`Memory usage: ${mem.label}`} value={mem.value} hasData={mem.hasData} />
          </div>
        </section>
        <section className="node-drawer__section">
          <h4>Configuration summary</h4>
          <dl className="node-drawer__config">
            {configSummary(node).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
        </section>
        <DockerSection containers={containers} />
        <section className="node-drawer__section">
          <h4>Recent results/activity</h4>
          <p className="node-drawer__muted">Latest telemetry received {metric ? formatHeartbeat(metric.timestamp) : 'No data yet'}.</p>
        </section>
        <section className="node-drawer__section node-drawer__actions">
          <h4>Management actions</h4>
          <button type="button" className="node-action" disabled={pending} onClick={onEdit}>Edit</button>
          <button type="button" className="node-action" disabled={pending} onClick={onPauseResume}>{pauseLabel}</button>
          <button type="button" className="node-action node-action--danger" onClick={onDelete}>More actions</button>
        </section>
      </aside>
    </div>
  );
}

function EditDialog({ node, pending, onCancel, onSave }: {
  readonly node: ApiNode;
  readonly pending: boolean;
  readonly onCancel: () => void;
  readonly onSave: (formData: FormData) => void;
}) {
  const config = editableConfig(node);
  return (
    <div className="node-dialog" role="presentation">
      <form className="node-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="edit-node-title" onSubmit={(event) => { event.preventDefault(); onSave(new FormData(event.currentTarget)); }}>
        <h3 id="edit-node-title">Edit {node.name}</h3>
        <label>Node name<input name="name" defaultValue={node.name} required maxLength={80} /></label>
        {node.type === 'agentless_http' && (
          <div className="node-dialog__fields">
            <label>URL<input name="url" type="url" defaultValue={String(config.url ?? '')} required /></label>
            <label>Interval<input name="interval" type="number" min="30" defaultValue={String(config.interval ?? config.interval_seconds ?? 300)} required /></label>
            <label>Timeout<input name="timeout" type="number" min="1" defaultValue={String(config.timeout ?? config.timeout_seconds ?? 10)} required /></label>
            <label>Expected status<input name="expected_status" type="number" min="100" max="599" defaultValue={String(config.expected_status ?? 200)} required /></label>
          </div>
        )}
        {node.type === 'agentless_tcp' && (
          <div className="node-dialog__fields">
            <label>Host<input name="host" defaultValue={String(config.host ?? '')} required /></label>
            <label>Port<input name="port" type="number" min="1" max="65535" defaultValue={String(config.port ?? '')} required /></label>
            <label>Interval<input name="interval" type="number" min="30" defaultValue={String(config.interval ?? config.interval_seconds ?? 300)} required /></label>
            <label>Timeout<input name="timeout" type="number" min="1" defaultValue={String(config.timeout ?? config.timeout_seconds ?? 10)} required /></label>
          </div>
        )}
        <p className="node-drawer__muted">Secret fields cannot be edited from the dashboard.</p>
        <div className="node-dialog__actions">
          <button type="button" className="node-action" onClick={onCancel}>Cancel Edit</button>
          <button type="submit" className="node-action" disabled={pending}>Save Node</button>
        </div>
      </form>
    </div>
  );
}

function DockerSection({ containers }: { readonly containers: ReadonlyArray<ApiContainerMetric> }) {
  return (
    <section className="node-drawer__section">
      <h4>Docker containers</h4>
      {containers.length === 0 ? (
        <div className="node-drawer__empty">
          <h5>No container data yet</h5>
          <p>Docker data is not available from this node yet.</p>
        </div>
      ) : (
        <div className="node-docker-list">
          {containers.map((container) => (
            <article key={container.id ?? containerName(container)} className="node-docker-list__item">
              <strong>{containerName(container)}</strong>
              <span>{container.image ?? noData}</span>
              <span>{container.state ?? container.status ?? noData}</span>
              <span>CPU {container.cpu_percent == null ? noData : `${container.cpu_percent}%`}</span>
              <span>Memory {container.mem_percent == null ? noData : `${container.mem_percent}%`}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function DeleteDialog({ node, pending, onCancel, onConfirm }: {
  readonly node: ApiNode;
  readonly pending: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  return (
    <div className="node-dialog" role="presentation">
      <div className="node-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="delete-node-title">
        <h3 id="delete-node-title">Delete {node.name}?</h3>
        <p>Historical metrics will be preserved if the backend supports archive mode. This removes the node from active monitoring.</p>
        <div className="node-dialog__actions">
          <button type="button" className="node-action" autoFocus onClick={onCancel}>Keep Node</button>
          <button type="button" className="node-action node-action--danger" disabled={pending} onClick={onConfirm}>Delete Node</button>
        </div>
      </div>
    </div>
  );
}
