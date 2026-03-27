import { StatusBadge } from './StatusBadge';
import type { MonitorNode } from '../data/mockData';

interface NodeListProps {
  nodes: MonitorNode[];
}

export function NodeList({ nodes }: NodeListProps) {
  return (
    <div className="card node-list">
      <h3 className="section-title">Monitored Nodes</h3>
      <div className="node-list__table">
        <div className="node-list__header">
          <span>Node</span>
          <span>Status</span>
          <span>Ping</span>
          <span>Last Seen</span>
        </div>
        {nodes.map((node) => (
          <div key={node.id} className="node-list__row">
            <span className="node-list__name">{node.name}</span>
            <span><StatusBadge status={node.status} /></span>
            <span className="node-list__ping">
              {node.pingMs > 0 ? `${node.pingMs}ms` : '—'}
            </span>
            <span className="node-list__heartbeat">{node.lastHeartbeat}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
