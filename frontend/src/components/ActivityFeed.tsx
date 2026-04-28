import { AlertTriangle, CheckCircle, XCircle, RefreshCw } from 'lucide-react';

export type ActivityEventType = 'online' | 'offline' | 'warning' | 'recovery';

export interface ActivityEvent {
  readonly id: string;
  readonly timestamp: string;
  readonly type: ActivityEventType;
  readonly node: string;
  readonly message: string;
}

const eventIcons: Record<ActivityEvent['type'], typeof CheckCircle> = {
  online: CheckCircle,
  offline: XCircle,
  warning: AlertTriangle,
  recovery: RefreshCw,
};

const eventColors: Record<ActivityEvent['type'], string> = {
  online: 'var(--color-online)',
  offline: 'var(--color-danger)',
  warning: 'var(--color-warning)',
  recovery: 'var(--chart-line)',
};

interface ActivityFeedProps {
  events: ActivityEvent[];
}

export function ActivityFeed({ events }: ActivityFeedProps) {
  return (
    <div className="card activity-feed" role="region" aria-label="Recent activity feed">
      <h3 className="section-title">Recent Activity</h3>
      <div className="activity-feed__list" role="list" aria-label="Activity events">
        {events.map((evt) => {
          const Icon = eventIcons[evt.type];
          return (
            <div key={evt.id} className="activity-feed__item">
              <span className="activity-feed__icon" style={{ color: eventColors[evt.type] }}>
                <Icon size={16} />
              </span>
              <div className="activity-feed__content">
                <span className="activity-feed__node">{evt.node}</span>
                <span className="activity-feed__message">{evt.message}</span>
              </div>
              <span className="activity-feed__time">{evt.timestamp}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
