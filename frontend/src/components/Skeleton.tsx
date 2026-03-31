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
