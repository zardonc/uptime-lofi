// ═══════════════════════════════════════════
// Skeleton — Animated loading placeholder
// ═══════════════════════════════════════════

interface SkeletonProps {
  readonly width?: string;
  readonly height?: string;
  readonly borderRadius?: string;
}

export function Skeleton({ width = '100%', height = '20px', borderRadius = 'var(--radius-sm)' }: SkeletonProps) {
  return (
    <div
      className="skeleton"
      style={{ width, height, borderRadius }}
      aria-label="Loading..."
    />
  );
}

export function MetricCardSkeleton() {
  return (
    <div className="metric-card card">
      <div className="metric-card__header">
        <Skeleton width="18px" height="18px" borderRadius="50%" />
        <Skeleton width="80px" height="14px" />
      </div>
      <Skeleton width="60px" height="36px" borderRadius="var(--radius-sm)" />
      <Skeleton width="120px" height="12px" />
    </div>
  );
}

export function NodeListSkeleton() {
  return (
    <div className="card node-list" aria-label="Loading monitored nodes">
      <h3 className="section-title"><Skeleton width="160px" height="20px" /></h3>
      <div className="node-table-skeleton">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="node-row-skeleton">
            <Skeleton width="120px" height="16px" />
            <Skeleton width="60px" height="20px" borderRadius="var(--radius-sm)" />
            <Skeleton width="80px" height="14px" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ActivityFeedSkeleton() {
  return (
    <div className="card activity-feed" aria-label="Loading activity feed">
      <h3 className="section-title"><Skeleton width="120px" height="20px" /></h3>
      <div className="activity-feed-skeleton">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="activity-item-skeleton">
            <Skeleton width="20px" height="20px" borderRadius="50%" />
            <div className="activity-item-content">
              <Skeleton width="180px" height="14px" />
              <Skeleton width="80px" height="12px" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TrendChartSkeleton() {
  return (
    <div className="card trend-chart" aria-label="Loading trend chart">
      <Skeleton width="100%" height="260px" borderRadius="var(--radius-sm)" />
    </div>
  );
}
