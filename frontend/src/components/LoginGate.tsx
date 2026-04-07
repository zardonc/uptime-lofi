// ═══════════════════════════════════════════
// LoginGate — Uptime LoFi Dashboard
// Wraps the dashboard, shows login form if
// user doesn't have an active JWT session.
// ═══════════════════════════════════════════

import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Shield, Loader2 } from 'lucide-react';

export function LoginGate({ children }: { readonly children: React.ReactNode }) {
  const { isAuthenticated, isLoading: authLoading, error, login } = useAuth();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isUiLock, setIsUiLock] = useState<boolean | null>(null);

  useEffect(() => {
    import('../api/client').then((module) => {
      module.api.getAuthStatus().then((res) => setIsUiLock(res.is_ui_lock_enabled)).catch(() => setIsUiLock(true));
    });
  }, []);

  if (authLoading) {
    return (
      <div className="login-gate">
        <div className="login-gate__loader">
          <Loader2 className="spin-icon" size={32} />
          <p>Resuming session...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <>{children}</>;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || submitting) return;
    setSubmitting(true);
    try {
      await login(password);
    } catch {
      // error is set via context
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-gate">
      <form className="login-card card animate-in" onSubmit={handleSubmit} aria-label="Login form">
        <div className="login-card__icon">
          <Shield size={28} />
        </div>
        <h2 className="login-card__title">Uptime LoFi</h2>
        <p className="login-card__subtitle">
          {isUiLock === false
            ? 'First-time Setup: Enter Admin API Key'
            : 'Enter your access key to continue'}
        </p>

        <input
          id="login-password"
          className="login-card__input"
          type="password"
          placeholder={isUiLock === false ? 'Admin API Key' : 'Access Key'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          autoComplete="current-password"
          aria-label={isUiLock === false ? 'Admin API Key' : 'Access Key'}
          aria-describedby={error ? 'login-error' : undefined}
          aria-invalid={error ? 'true' : 'false'}
        />

        {error && <p id="login-error" className="login-card__error" role="alert" aria-live="polite">{error}</p>}

        <button
          id="login-submit"
          className="login-card__button"
          type="submit"
          disabled={submitting || !password.trim()}
        >
          {submitting ? <Loader2 className="spin-icon" size={16} /> : 'Unlock'}
        </button>
      </form>
    </div>
  );
}
