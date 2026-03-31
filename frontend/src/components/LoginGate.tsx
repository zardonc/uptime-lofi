// ═══════════════════════════════════════════
// LoginGate — Uptime LoFi Dashboard
// Wraps the dashboard, shows login form if
// user doesn't have an active JWT session.
// ═══════════════════════════════════════════

import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Shield, Loader2 } from 'lucide-react';

export function LoginGate({ children }: { readonly children: React.ReactNode }) {
  const { isAuthenticated, isLoading: authLoading, error, login } = useAuth();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
      <form className="login-card card animate-in" onSubmit={handleSubmit}>
        <div className="login-card__icon">
          <Shield size={28} />
        </div>
        <h2 className="login-card__title">Uptime LoFi</h2>
        <p className="login-card__subtitle">Enter your access key to continue</p>

        <input
          id="login-password"
          className="login-card__input"
          type="password"
          placeholder="Access Key"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          autoComplete="current-password"
        />

        {error && <p className="login-card__error">{error}</p>}

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
