import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Shield, ShieldAlert, KeyRound, Loader2 } from 'lucide-react';

export function Settings() {
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [uiLockEnabled, setUiLockEnabled] = useState(false);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    api.getAuthStatus()
      .then((res) => {
        setUiLockEnabled(res.is_ui_lock_enabled);
        setLoadingInitial(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load settings');
        setLoadingInitial(false);
      });
  }, []);

  const generateRandom = () => {
    const randomPass = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
    setPassword(randomPass);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uiLockEnabled && !password.trim()) {
      setError('Password is required when UI Lock is enabled.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await api.updateSecuritySettings({
        enabled: uiLockEnabled,
        password: uiLockEnabled ? password : '',
      });
      setSuccess(true);
      // Wait a moment so user sees success message, then hard reload to verify login state
      setTimeout(() => {
        window.location.replace('/login');
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loadingInitial) {
    return (
      <div className="card" style={{ padding: '2rem', display: 'flex', justifyContent: 'center' }}>
        <Loader2 className="spin-icon" size={24} />
      </div>
    );
  }

  return (
    <div className="card animate-in" style={{ maxWidth: '600px', margin: '0 auto' }}>
      <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <Shield size={20} />
        Dashboard Security
      </h2>

      <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '0.9rem', lineHeight: 1.5 }}>
        By default, the dashboard is protected by the Master API Secret Key. You can enable a custom UI Access Key below to use a simpler password for daily logins while keeping the Master Key secret.
      </p>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Toggle Switch Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>UI Access Lock</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Require a custom password to view the dashboard</span>
          </div>
          <label className="toggle-switch" style={{ position: 'relative', display: 'inline-block', width: '40px', height: '24px' }}>
            <input 
              type="checkbox" 
              checked={uiLockEnabled} 
              onChange={(e) => setUiLockEnabled(e.target.checked)} 
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span className="slider round" style={{ 
              position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, 
              backgroundColor: uiLockEnabled ? 'var(--accent-primary)' : 'var(--bg-tertiary)', 
              transition: '.4s', borderRadius: '24px' 
            }}>
              <span style={{
                position: 'absolute', content: '""', height: '18px', width: '18px', left: '3px', bottom: '3px',
                backgroundColor: 'white', transition: '.4s', borderRadius: '50%',
                transform: uiLockEnabled ? 'translateX(16px)' : 'translateX(0)'
              }} />
            </span>
          </label>
        </div>

        {/* Custom Password Input */}
        {uiLockEnabled && (
          <div className="animate-in delay-1" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
            <label style={{ fontSize: '0.9rem', fontWeight: 500 }}>Custom Password</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <KeyRound size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter a secure password..."
                  style={{ 
                    width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', 
                    background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', 
                    borderRadius: '8px', color: 'var(--text-primary)', outline: 'none' 
                  }}
                />
              </div>
              <button 
                type="button" 
                onClick={generateRandom}
                style={{ 
                  padding: '0 1rem', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', 
                  border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', fontWeight: 500 
                }}
              >
                Generate
              </button>
            </div>
            {!password && <div style={{ color: 'var(--status-warning)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
              <ShieldAlert size={14} /> Password will be required on next login
            </div>}
          </div>
        )}

        <hr style={{ border: 0, borderTop: '1px solid var(--border-color)', margin: '0.5rem 0' }} />

        {error && <div style={{ color: 'var(--status-danger)', fontSize: '0.9rem', background: 'var(--status-danger-bg)', padding: '0.75rem', borderRadius: '6px' }}>{error}</div>}
        {success && <div style={{ color: 'var(--status-online)', fontSize: '0.9rem', background: 'var(--status-online-bg)', padding: '0.75rem', borderRadius: '6px' }}>Settings saved successfully! Reloading...</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button 
            type="submit" 
            disabled={saving || (uiLockEnabled && !password)}
            style={{
              padding: '0.75rem 2rem', background: 'var(--accent-primary)', color: 'var(--accent-text)',
              border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              opacity: (saving || (uiLockEnabled && !password)) ? 0.6 : 1
            }}
          >
            {saving ? <Loader2 className="spin-icon" size={16} /> : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
