import { useEffect, useState } from 'react';

interface UptimeRingProps {
  percentage: number;
  label?: string;
}

const RING_SIZE = 160;
const STROKE_WIDTH = 12;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function UptimeRing({ percentage, label = 'Avg Uptime' }: UptimeRingProps) {
  const [offset, setOffset] = useState(CIRCUMFERENCE);

  useEffect(() => {
    const timer = setTimeout(() => {
      setOffset(CIRCUMFERENCE - (percentage / 100) * CIRCUMFERENCE);
    }, 300);
    return () => clearTimeout(timer);
  }, [percentage]);

  return (
    <div className="card uptime-ring" role="img" aria-label={`${label}: ${percentage} percent uptime`}>
      <h3 className="section-title">{label}</h3>
      <div className="uptime-ring__container">
        <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
          {/* Background track */}
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--border-light)"
            strokeWidth={STROKE_WIDTH}
          />
          {/* Foreground arc */}
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--color-online)"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            style={{ transition: `stroke-dashoffset 1.2s var(--ease-out)` }}
          />
        </svg>
        <div className="uptime-ring__text">
          <span className="uptime-ring__value">{percentage}%</span>
        </div>
      </div>
    </div>
  );
}
