import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useForm } from 'react-hook-form';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { api } from '../api/client';
import type { Monitor, PublicStatusSettings } from '../api/types';
import { useAuth } from '../hooks/useAuth';
import { ProbeSetup } from './ProbeSetup';
import { Eye, EyeOff, KeyRound, Loader2, Shield, ShieldAlert } from 'lucide-react';

type SettingsFormData = {
  uiLockEnabled: boolean;
  password: string;
};

const defaultPublicStatus: PublicStatusSettings = {
  enabled: false,
  private_slug: null,
  show_uptime: true,
  show_latency: true,
  show_incidents: true,
  show_monitor_type: true,
};

export function Settings() {
  const { logout } = useAuth();
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [savingSecurity, setSavingSecurity] = useState(false);
  const [savingPublic, setSavingPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [securitySuccess, setSecuritySuccess] = useState(false);
  const [publicSuccess, setPublicSuccess] = useState(false);
  const [publicStatus, setPublicStatus] = useState<PublicStatusSettings>(defaultPublicStatus);
  const [monitors, setMonitors] = useState<ReadonlyArray<Monitor>>([]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SettingsFormData>({
    defaultValues: {
      uiLockEnabled: false,
      password: '',
    },
  });

  const uiLockEnabled = watch('uiLockEnabled');

  useEffect(() => {
    Promise.all([api.getSettings(), api.getMonitors()])
      .then(([settings, monitorResponse]) => {
        setValue('uiLockEnabled', settings.data.is_ui_lock_enabled);
        setPublicStatus(settings.data.public_status);
        setMonitors(monitorResponse.data);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load settings');
      })
      .finally(() => setLoadingInitial(false));
  }, [setValue]);

  const generateRandom = () => {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    const values = new Uint32Array(12);
    crypto.getRandomValues(values);
    const randomPass = Array.from(values, v => charset[v % charset.length]).join('');
    setValue('password', randomPass, { shouldValidate: true, shouldDirty: true });
  };

  const onSecuritySubmit = async (data: SettingsFormData) => {
    setSavingSecurity(true);
    setError(null);
    setSecuritySuccess(false);

    try {
      await api.updateSecuritySettings({
        enabled: data.uiLockEnabled,
        password: data.uiLockEnabled ? data.password : '',
      });
      setSecuritySuccess(true);
      setTimeout(async () => {
        await logout();
      }, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSavingSecurity(false);
    }
  };

  const onPublicSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const nextPublicStatus: PublicStatusSettings = {
      enabled: data.get('enabled') === 'on',
      private_slug: String(data.get('private_slug') ?? '').trim() || null,
      show_uptime: data.get('show_uptime') === 'on',
      show_latency: data.get('show_latency') === 'on',
      show_incidents: data.get('show_incidents') === 'on',
      show_monitor_type: data.get('show_monitor_type') === 'on',
    };
    const monitorVisibility = monitors.map((monitor) => ({
      id: monitor.id,
      public_visible: data.get(`monitor:${monitor.id}`) === 'on',
    }));

    setSavingPublic(true);
    setError(null);
    setPublicSuccess(false);
    try {
      const response = await api.updatePublicStatusSettings({ ...nextPublicStatus, monitors: monitorVisibility });
      setPublicStatus(response.data.public_status);
      setMonitors((current) => current.map((monitor) => {
        const visible = monitorVisibility.find((item) => item.id === monitor.id)?.public_visible;
        return typeof visible === 'boolean' ? { ...monitor, public_visible: visible } : monitor;
      }));
      setPublicSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save Public Status settings');
    } finally {
      setSavingPublic(false);
    }
  };

  if (loadingInitial) {
    return (
      <div className="card settings-loading">
        <Loader2 className="spin-icon" size={24} />
      </div>
    );
  }

  return (
    <div className="settings-page">
      <section className="card settings-panel animate-in" aria-labelledby="settings-security-title">
        <div className="settings-panel__heading">
          <Shield size={20} />
          <div>
            <h2 id="settings-security-title" className="section-title">Dashboard Security</h2>
            <p>Use a dashboard password for daily access while keeping the master key server-side.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSecuritySubmit)} className="settings-form">
          <div className="settings-toggle-row">
            <div>
              <label htmlFor="settings-ui-lock">UI Access Lock</label>
              <span>Require a custom password to view the dashboard</span>
            </div>
            <ToggleInput id="settings-ui-lock" label="UI Access Lock" register={register('uiLockEnabled')} checked={uiLockEnabled} />
          </div>

          {uiLockEnabled && (
            <div className="settings-password-field animate-in delay-1">
              <label htmlFor="settings-password">Custom Password</label>
              <div className="settings-password-field__input">
                <KeyRound size={16} aria-hidden="true" />
                <input
                  id="settings-password"
                  type="text"
                  {...register('password', {
                    validate: (value) => {
                      if (!uiLockEnabled) return true;
                      return value.trim().length >= 8 || 'Password must be at least 8 characters';
                    },
                  })}
                  placeholder="Enter a secure password..."
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'password-error' : 'password-hint'}
                />
                <button type="button" className="node-action" onClick={generateRandom}>Generate</button>
              </div>
              {errors.password ? (
                <div id="password-error" className="settings-form__error">
                  <ShieldAlert size={14} /> {errors.password.message}
                </div>
              ) : (
                <div id="password-hint" className="settings-form__hint">
                  Minimum 8 characters. Use letters, numbers, and symbols for best security.
                </div>
              )}
            </div>
          )}

          {error && <div className="settings-form__error" role="alert">{error}</div>}
          {securitySuccess && <div className="settings-form__success">Settings saved successfully! Reloading...</div>}

          <div className="settings-form__actions">
            <button type="submit" className="page-header__primary" disabled={savingSecurity}>
              {savingSecurity ? <Loader2 className="spin-icon" size={16} /> : null}
              Save Changes
            </button>
          </div>
        </form>
      </section>

      <section className="card settings-panel animate-in delay-1" aria-labelledby="settings-public-title">
        <div className="settings-panel__heading">
          {publicStatus.enabled ? <Eye size={20} /> : <EyeOff size={20} />}
          <div>
            <h2 id="settings-public-title" className="section-title">Public Status</h2>
            <p>Control the unauthenticated status page, visible monitors, and exposed fields.</p>
          </div>
        </div>

        <form className="settings-form public-status-form" onSubmit={onPublicSubmit}>
          <div className="settings-toggle-row">
            <div>
              <label htmlFor="public-status-enabled">Public Status enabled</label>
              <span>Allow unauthenticated reads through the safe public API.</span>
            </div>
            <input id="public-status-enabled" name="enabled" type="checkbox" defaultChecked={publicStatus.enabled} />
          </div>

          <label className="settings-field">
            Private slug
            <input name="private_slug" defaultValue={publicStatus.private_slug ?? ''} placeholder="optional-private-slug" />
          </label>

          <fieldset className="settings-fieldset">
            <legend>Visible fields</legend>
            <label><input name="show_uptime" type="checkbox" defaultChecked={publicStatus.show_uptime} /> Uptime</label>
            <label><input name="show_latency" type="checkbox" defaultChecked={publicStatus.show_latency} /> Latency</label>
            <label><input name="show_incidents" type="checkbox" defaultChecked={publicStatus.show_incidents} /> Incidents</label>
            <label><input name="show_monitor_type" type="checkbox" defaultChecked={publicStatus.show_monitor_type} /> Monitor type</label>
          </fieldset>

          <fieldset className="settings-fieldset public-monitor-settings">
            <legend>Public monitors</legend>
            {monitors.length === 0 ? (
              <p>No monitors are available yet.</p>
            ) : monitors.map((monitor) => (
              <label key={monitor.id}>
                <input name={`monitor:${monitor.id}`} type="checkbox" defaultChecked={monitor.public_visible} />
                <span>{monitor.name}</span>
                <small>{monitor.type.toUpperCase()} - {monitor.target.label}</small>
              </label>
            ))}
          </fieldset>

          {publicSuccess && <div className="settings-form__success">Public Status settings saved.</div>}
          <div className="settings-form__actions">
            <button type="submit" className="page-header__primary" disabled={savingPublic}>
              {savingPublic ? <Loader2 className="spin-icon" size={16} /> : null}
              Save Public Status
            </button>
          </div>
        </form>
      </section>

      <section className="card animate-in delay-2">
        <h2 className="section-title">Probe Installation</h2>
        <ProbeSetup />
      </section>
    </div>
  );
}

function ToggleInput({ id, label, checked, register }: {
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
  readonly register: UseFormRegisterReturn<'uiLockEnabled'>;
}) {
  return (
    <label className="toggle-switch" aria-label={label}>
      <input
        id={id}
        aria-label={label}
        type="checkbox"
        {...register}
      />
      <span className={`toggle-switch__track ${checked ? 'toggle-switch__track--checked' : ''}`}>
        <span />
      </span>
    </label>
  );
}
