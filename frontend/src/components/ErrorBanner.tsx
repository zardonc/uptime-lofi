// ═══════════════════════════════════════════
// ErrorBanner — inline error display
// ═══════════════════════════════════════════

import { AlertTriangle } from 'lucide-react';

interface ErrorBannerProps {
  readonly message: string;
  readonly onRetry?: () => void;
}

export function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div className="error-banner card">
      <AlertTriangle size={18} />
      <span>{message}</span>
      {onRetry && (
        <button className="error-banner__retry" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
