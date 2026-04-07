import type { ReactNode } from 'react';

interface MetricCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  suffix?: string;
  trend?: { direction: 'up' | 'down'; text: string };
}

export function MetricCard({ icon, label, value, suffix, trend }: MetricCardProps) {
  return (
    <div className="metric-card card" role="region" aria-label={`${label}: ${value}${suffix || ''}`}>
      <div className="metric-card__header">
        <span className="metric-card__icon">{icon}</span>
        <span className="metric-card__label">{label}</span>
      </div>
      <div className="metric-card__value">
        {value}
        {suffix && <span className="metric-card__suffix">{suffix}</span>}
      </div>
      <div className={`metric-card__trend ${trend ? `trend--${trend.direction}` : 'trend--placeholder'}`}>
        {trend ? `${trend.direction === 'up' ? '↑' : '↓'} ${trend.text}` : '\u00A0'}
      </div>
    </div>
  );
}
