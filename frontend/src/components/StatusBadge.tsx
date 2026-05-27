import type { MonitorStatus, NodeStatus } from '../api/types';

type StatusBadgeStatus = NodeStatus | MonitorStatus;

const statusConfig: Record<StatusBadgeStatus, { label: string; className: string }> = {
  online:   { label: 'Online',   className: 'badge-online'   },
  degraded: { label: 'Degraded', className: 'badge-warning'  },
  offline:  { label: 'Offline',  className: 'badge-danger'   },
  paused:   { label: 'Paused',   className: 'badge-paused'   },
  unknown:  { label: 'Unknown',  className: 'badge-unknown'  },
};

export function StatusBadge({ status }: { status: StatusBadgeStatus }) {
  const config = statusConfig[status];
  return <span className={`status-badge ${config.className}`}>{config.label}</span>;
}
