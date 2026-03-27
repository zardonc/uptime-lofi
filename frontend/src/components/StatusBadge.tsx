import type { NodeStatus } from '../data/mockData';

const statusConfig: Record<NodeStatus, { label: string; className: string }> = {
  online:   { label: 'Online',   className: 'badge-online'   },
  degraded: { label: 'Degraded', className: 'badge-warning'  },
  offline:  { label: 'Offline',  className: 'badge-danger'   },
  paused:   { label: 'Paused',   className: 'badge-paused'   },
};

export function StatusBadge({ status }: { status: NodeStatus }) {
  const config = statusConfig[status];
  return <span className={`status-badge ${config.className}`}>{config.label}</span>;
}
