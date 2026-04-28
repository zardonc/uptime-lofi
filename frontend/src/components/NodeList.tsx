import { StatusBadge } from './StatusBadge';
import type { ApiNode } from '../api/types';

function formatHeartbeat(epoch: number): string {
  const diff = Math.floor(Date.now() / 1000) - epoch;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

interface NodeListProps {
  readonly nodes: ReadonlyArray<ApiNode>;
}

export function NodeList({ nodes }: NodeListProps) {
  return (
    <div className="card node-list" role="region" aria-label="Monitored nodes list">
      <h3 className="section-title">Monitored Nodes</h3>
      <div className="node-list__table" role="table" aria-label="List of monitored nodes with status and metrics">
        <div className="node-list__header">
          <span>Node</span>
          <span>Status</span>
          <span>Ping</span>
          <span>Last Seen</span>
        </div>
        {nodes.length === 0 && (
          <div className="node-list__empty">No nodes registered yet</div>
        )}
        {nodes.map((node) => (
          <div key={node.id} className="node-list__row">
            <span className="node-list__name">{node.name}</span>
            <span><StatusBadge status={node.status} /></span>
            <span className="node-list__ping">
              {node.ping_ms != null && node.ping_ms > 0 ? `${node.ping_ms}ms` : '—'}
            </span>
            <span className="node-list__heartbeat">{formatHeartbeat(node.last_heartbeat)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

