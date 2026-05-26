import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useForm } from 'react-hook-form';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { api } from '../api/client';
import type { CreateNotificationChannelRequest, Monitor, NotificationChannel, PublicStatusSettings } from '../api/types';
import { useAuth } from '../hooks/useAuth';
import { ProbeSetup } from './ProbeSetup';
import { Bell, Eye, EyeOff, KeyRound, Link, Loader2, Mail, Send, Shield, ShieldAlert, Trash2 } from 'lucide-react';

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
  const [channelSuccess, setChannelSuccess] = useState(false);
  const [publicStatus, setPublicStatus] = useState<PublicStatusSettings>(defaultPublicStatus);
  const [monitors, setMonitors] = useState<ReadonlyArray<Monitor>>([]);
  const [notificationChannels, setNotificationChannels] = useState<ReadonlyArray<NotificationChannel>>([]);
  const [savingChannel, setSavingChannel] = useState(false);
  const [channelType, setChannelType] = useState<NotificationChannel['type']>('webhook');

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
    Promise.all([api.getSettings(), api.getMonitors(), api.getNotificationChannels()])
      .then(([settings, monitorResponse, channelResponse]) => {
        setValue('uiLockEnabled', settings.data.is_ui_lock_enabled);
        setPublicStatus(settings.data.public_status);
        setMonitors(monitorResponse.data);
        setNotificationChannels(channelResponse.data);
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

  const onChannelSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const submittedType = String(data.get('type') ?? channelType) as NotificationChannel['type'];
    const payload = buildChannelPayload(submittedType, data);

    setSavingChannel(true);
    setError(null);
    setChannelSuccess(false);
    try {
      const response = await api.createNotificationChannel(payload);
      setNotificationChannels((current) => [response.data, ...current]);
      setChannelSuccess(true);
      form.reset();
      setChannelType('webhook');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save notification channel');
    } finally {
      setSavingChannel(false);
    }
  };

  const testChannel = async (channel: NotificationChannel) => {
    setError(null);
    const response = await api.testNotificationChannel(channel.id);
    setNotificationChannels((current) => current.map((item) => item.id === channel.id ? response.data : item));
  };

  const deleteChannel = async (channel: NotificationChannel) => {
    setError(null);
    await api.deleteNotificationChannel(channel.id);
    setNotificationChannels((current) => current.filter((item) => item.id !== channel.id));
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
      <header className="dashboard-header settings-page__header" role="banner">
        <div>
          <h1>Settings</h1>
          <p className="subtitle">Backend connection, security, public status, and notification channels</p>
        </div>
      </header>

      <div className="settings-page__body">
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

      <section className="card settings-panel animate-in delay-2" aria-labelledby="settings-notifications-title">
        <div className="settings-panel__heading">
          <Bell size={20} />
          <div>
            <h2 id="settings-notifications-title" className="section-title">Notification Channels</h2>
            <p>Configure server-side delivery targets for alert rules.</p>
          </div>
        </div>

        <div className="settings-form notification-settings">
          <div className="notification-channel-list" aria-label="Notification channels">
            {notificationChannels.length === 0 ? (
              <p className="settings-form__hint">No notification channels yet.</p>
            ) : notificationChannels.map((channel) => (
              <div className="notification-channel-row" key={channel.id}>
                <span className="notification-channel-row__icon">{channelIcon(channel.type)}</span>
                <div>
                  <strong>{channel.name}</strong>
                  <span>{channel.type} · {channel.redacted_label ?? 'No endpoint summary'} · {channel.delivery_status}</span>
                </div>
                <div className="notification-channel-row__actions">
                  <button type="button" className="node-action" onClick={() => void testChannel(channel)} disabled={channel.type === 'email' || !channel.enabled}>Test</button>
                  <button type="button" className="node-action" disabled>Edit</button>
                  <button type="button" className="node-action node-action--icon node-action--danger" aria-label={`Delete ${channel.name}`} onClick={() => void deleteChannel(channel)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}

            <div className="notification-channel-row notification-channel-row--reserved">
              <span className="notification-channel-row__icon"><Mail size={16} /></span>
              <div>
                <strong>Email</strong>
                <span>Coming soon · reserved for a future phase</span>
              </div>
              <button type="button" className="node-action" disabled>Configure</button>
            </div>
          </div>

          <form className="notification-channel-form" aria-label="Notification channel form" onSubmit={onChannelSubmit}>
            <label>Type
              <select name="type" value={channelType} onChange={(event) => setChannelType(event.target.value as NotificationChannel['type'])}>
                <option value="webhook">Webhook</option>
                <option value="telegram">Telegram</option>
                <option value="email" disabled>Email (coming soon)</option>
              </select>
            </label>
            <label>Name<input name="name" placeholder={channelType === 'telegram' ? 'SRE Telegram' : 'Ops webhook'} required /></label>
            {channelType === 'webhook' ? (
              <>
                <label>Webhook URL<input name="url" type="url" placeholder="https://hooks.example.com/alerts" required /></label>
                <label>Secret header name<input name="header_name" placeholder="x-alert-secret" /></label>
                <label>Secret header value<input name="header_value" type="password" placeholder="Stored server-side" /></label>
              </>
            ) : (
              <>
                <label>Telegram bot token<input name="bot_token" type="password" placeholder="123456:token" required /></label>
                <label>Telegram chat ID<input name="chat_id" placeholder="-1001234567890" required /></label>
              </>
            )}
            {channelSuccess && <div className="settings-form__success">Notification channel saved.</div>}
            <div className="settings-form__actions">
              <button type="submit" className="page-header__primary" disabled={savingChannel}>
                {savingChannel ? <Loader2 className="spin-icon" size={16} /> : null}
                Add Channel
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="card animate-in delay-2">
        <h2 className="section-title">Probe Installation</h2>
        <ProbeSetup />
      </section>
      </div>
    </div>
  );
}

function buildChannelPayload(type: NotificationChannel['type'], data: FormData): CreateNotificationChannelRequest {
  const name = String(data.get('name') ?? '').trim();
  if (type === 'webhook') {
    const headerName = String(data.get('header_name') ?? '').trim();
    const headerValue = String(data.get('header_value') ?? '').trim();
    return {
      name,
      type,
      config: {
        url: String(data.get('url') ?? '').trim(),
        headers: headerName && headerValue ? { [headerName]: headerValue } : {},
      },
    };
  }

  return {
    name,
    type: 'telegram',
    config: {
      bot_token: String(data.get('bot_token') ?? '').trim(),
      chat_id: String(data.get('chat_id') ?? '').trim(),
    },
  };
}

function channelIcon(type: NotificationChannel['type']) {
  if (type === 'telegram') return <Send size={16} />;
  if (type === 'webhook') return <Link size={16} />;
  return <Mail size={16} />;
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
