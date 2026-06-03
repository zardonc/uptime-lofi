import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Bell, History, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { api, ApiClientError } from '../api/client';
import type { AlertCondition, AlertEvent, AlertRule, Monitor, NotificationChannel } from '../api/types';
import { ErrorBanner } from './ErrorBanner';

type AlertsTab = 'rules' | 'history';

const CONDITION_LABELS: Record<AlertCondition, string> = {
  offline: 'Offline',
  latency: 'Latency',
  http_status: 'HTTP status',
  cpu: 'CPU',
  memory: 'Memory',
};

export function AlertsPage() {
  const [activeTab, setActiveTab] = useState<AlertsTab>('rules');
  const [rules, setRules] = useState<ReadonlyArray<AlertRule>>([]);
  const [history, setHistory] = useState<ReadonlyArray<AlertEvent>>([]);
  const [monitors, setMonitors] = useState<ReadonlyArray<Monitor>>([]);
  const [channels, setChannels] = useState<ReadonlyArray<NotificationChannel>>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadAlerts = async () => {
    try {
      setError(null);
      const [rulesResponse, historyResponse, monitorsResponse, channelsResponse] = await Promise.all([
        api.getAlertRules(),
        api.getAlertHistory(),
        api.getMonitors(),
        api.getNotificationChannels(),
      ]);
      setRules(rulesResponse.data);
      setHistory(historyResponse.data);
      setMonitors(monitorsResponse.data);
      setChannels(channelsResponse.data);
    } catch (loadError) {
      setError(loadError instanceof ApiClientError ? loadError.message : 'Could not load alerts.');
    }
  };

  useEffect(() => {
    void loadAlerts();
  }, []);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const monitorId = String(formData.get('monitor_id') ?? '');
    const condition = String(formData.get('condition') ?? 'offline') as AlertCondition;
    setSaving(true);
    setError(null);
    try {
      const response = await api.createAlertRule({
        name: String(formData.get('name') ?? ''),
        monitor_id: monitorId,
        condition,
        severity: String(formData.get('severity') ?? 'warning') as AlertRule['severity'],
        params: paramsForCondition(condition, formData),
        channel_ids: formData.getAll('channel_ids').map(String).filter(Boolean),
        confirm_for_sec: Number(formData.get('confirm_for_sec') ?? 0),
        repeat_interval_sec: Number(formData.get('repeat_interval_sec') ?? 3600),
        timezone: String(formData.get('timezone') ?? 'UTC'),
      });
      setRules((current) => [response.data, ...current]);
      form.reset();
      setShowForm(false);
    } catch (saveError) {
      setError(saveError instanceof ApiClientError ? saveError.message : 'Could not save alert rule.');
    } finally {
      setSaving(false);
    }
  };

  const toggleRule = async (rule: AlertRule) => {
    const response = rule.enabled ? await api.disableAlertRule(rule.id) : await api.enableAlertRule(rule.id);
    setRules((current) => current.map((item) => item.id === rule.id ? response.data : item));
  };

  const deleteRule = async (rule: AlertRule) => {
    await api.deleteAlertRule(rule.id);
    setRules((current) => current.filter((item) => item.id !== rule.id));
  };

  return (
    <div className="dashboard alerts-page">
      <header className="dashboard-header animate-in" role="banner">
        <div>
          <h1>Alerts</h1>
          <p className="subtitle">Rules and incident history from monitor state</p>
        </div>
        <button type="button" className="page-header__primary" onClick={() => setShowForm((value) => !value)}>
          <Plus size={18} /> New Rule
        </button>
      </header>

      {error && <ErrorBanner message={error} onRetry={loadAlerts} />}

      <div className="alerts-tabs" role="tablist" aria-label="Alerts tabs">
        <button type="button" role="tab" aria-selected={activeTab === 'rules'} onClick={() => setActiveTab('rules')}>
          <Bell size={16} /> Rules
        </button>
        <button type="button" role="tab" aria-selected={activeTab === 'history'} onClick={() => setActiveTab('history')}>
          <History size={16} /> History
        </button>
      </div>

      {activeTab === 'rules' ? (
        <>
          {showForm && (
            <div className="monitor-dialog alerts-rule-dialog-shell" role="presentation">
              <div className="monitor-dialog__panel alerts-rule-dialog" role="dialog" aria-modal="true" aria-labelledby="alert-rule-dialog-title">
                <AlertRuleForm
                  monitors={monitors}
                  channels={channels}
                  disabled={saving}
                  onCancel={() => setShowForm(false)}
                  onSubmit={handleCreate}
                />
              </div>
            </div>
          )}
          <AlertRulesList rules={rules} monitors={monitors} channels={channels} onToggle={toggleRule} onDelete={deleteRule} />
        </>
      ) : (
        <AlertHistory events={history} />
      )}
    </div>
  );
}

function AlertRuleForm({
  monitors,
  channels,
  disabled,
  onCancel,
  onSubmit,
}: {
  readonly monitors: ReadonlyArray<Monitor>;
  readonly channels: ReadonlyArray<NotificationChannel>;
  readonly disabled: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [monitorId, setMonitorId] = useState('');
  const effectiveMonitorId = monitorId || monitors[0]?.id || '';
  const selectedMonitor = monitors.find((monitor) => monitor.id === effectiveMonitorId) ?? monitors[0] ?? null;
  const conditions = useMemo(() => selectedMonitor ? conditionsForMonitor(selectedMonitor) : [], [selectedMonitor]);
  const [condition, setCondition] = useState<AlertCondition>('offline');
  const effectiveCondition = conditions.includes(condition) ? condition : conditions[0] ?? 'offline';
  const enabledDeliveryChannels = channels.filter((channel) => channel.enabled && (channel.type === 'webhook' || channel.type === 'telegram'));

  return (
    <form className="alerts-rule-form card" aria-label="Alert rule form" onSubmit={onSubmit}>
      <div className="alerts-rule-form__header">
        <div>
          <h2 id="alert-rule-dialog-title">Create alert rule</h2>
          <p>Choose enabled Webhook or Telegram channels for delivery.</p>
        </div>
        <button type="button" className="monitor-action monitor-action--icon" aria-label="Close alert rule form" onClick={onCancel}>
          <X size={16} />
        </button>
      </div>

      <label>Name<input name="name" placeholder="Homepage offline" required /></label>
      <label>Monitor
        <select
          name="monitor_id"
          value={effectiveMonitorId}
          onChange={(event) => {
            const nextMonitorId = event.target.value;
            setMonitorId(nextMonitorId);
            const nextMonitor = monitors.find((monitor) => monitor.id === nextMonitorId);
            setCondition(nextMonitor ? conditionsForMonitor(nextMonitor)[0] ?? 'offline' : 'offline');
          }}
          required
        >
          {monitors.map((monitor) => <option key={monitor.id} value={monitor.id}>{monitor.name} ({monitor.type})</option>)}
        </select>
      </label>
      <label>Condition
        <select name="condition" value={effectiveCondition} onChange={(event) => setCondition(event.target.value as AlertCondition)} required>
          {conditions.map((item) => <option key={item} value={item}>{CONDITION_LABELS[item]}</option>)}
        </select>
      </label>
      <ConditionFields condition={effectiveCondition} />
      <label>Severity
        <select name="severity" defaultValue="warning">
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
        </select>
      </label>
      <fieldset className="alerts-channel-picker">
        <legend>Notification channels</legend>
        {enabledDeliveryChannels.length === 0 ? (
          <p>No enabled Webhook or Telegram channels are configured.</p>
        ) : enabledDeliveryChannels.map((channel) => (
          <label key={channel.id}>
            <input name="channel_ids" type="checkbox" value={channel.id} defaultChecked={enabledDeliveryChannels.length === 1} />
            <span>{channel.name}</span>
            <small>{channel.type} · {channel.redacted_label ?? 'redacted'}</small>
          </label>
        ))}
        <label className="alerts-channel-picker__disabled">
          <input type="checkbox" disabled />
          <span>Email</span>
          <small>Coming soon</small>
        </label>
      </fieldset>
      <details className="alerts-advanced">
        <summary><SlidersHorizontal size={16} /> Advanced options</summary>
        <div className="alerts-advanced__grid">
          <label>Confirm after seconds<input name="confirm_for_sec" type="number" min="0" defaultValue="0" /></label>
          <label>Repeat interval seconds<input name="repeat_interval_sec" type="number" min="0" defaultValue="3600" /></label>
          <label>Timezone<input name="timezone" defaultValue="UTC" /></label>
        </div>
      </details>
      <div className="alerts-rule-form__actions">
        <button type="button" className="monitor-action" onClick={onCancel}>Cancel</button>
        <button type="submit" className="page-header__primary" disabled={disabled || monitors.length === 0}>Create Rule</button>
      </div>
    </form>
  );
}

function ConditionFields({ condition }: { readonly condition: AlertCondition }) {
  if (condition === 'latency') {
    return <label>Latency threshold<input name="threshold_ms" type="number" min="1" defaultValue="1000" /></label>;
  }
  if (condition === 'http_status') {
    return <label>Expected status<input name="expected_status" type="number" min="100" max="599" defaultValue="200" /></label>;
  }
  if (condition === 'cpu' || condition === 'memory') {
    return <label>Threshold percent<input name="threshold_percent" type="number" min="1" max="100" defaultValue="90" /></label>;
  }
  return null;
}

function AlertRulesList({
  rules,
  monitors,
  channels,
  onToggle,
  onDelete,
}: {
  readonly rules: ReadonlyArray<AlertRule>;
  readonly monitors: ReadonlyArray<Monitor>;
  readonly channels: ReadonlyArray<NotificationChannel>;
  readonly onToggle: (rule: AlertRule) => void;
  readonly onDelete: (rule: AlertRule) => void;
}) {
  if (rules.length === 0) {
    return <section className="card alerts-empty"><h2>No alert rules yet</h2><p>Create a rule from a monitor condition.</p></section>;
  }

  return (
    <section className="alerts-rules-list" aria-label="Alert rules">
      {rules.map((rule) => {
        const monitor = monitors.find((item) => item.id === rule.monitor_id);
        const channelNames = rule.channel_ids
          .map((id) => channels.find((channel) => channel.id === id)?.name ?? id)
          .join(', ');
        return (
          <article className="alert-rule-card" key={rule.id} aria-label={`${rule.name} alert rule`}>
            <div>
              <h2>{rule.name}</h2>
              <p>{monitor?.name ?? rule.monitor_id} · {CONDITION_LABELS[rule.condition]}</p>
            </div>
            <dl>
              <div><dt>Severity</dt><dd>{rule.severity}</dd></div>
              <div><dt>Channels</dt><dd>{channelNames || 'None'}</dd></div>
              <div><dt>Confirm</dt><dd>{rule.confirm_for_sec}s</dd></div>
              <div><dt>Repeat</dt><dd>{rule.repeat_interval_sec}s</dd></div>
            </dl>
            <div className="alert-rule-card__actions">
              <button type="button" className="monitor-action" onClick={() => onToggle(rule)}>{rule.enabled ? 'Disable' : 'Enable'}</button>
              <button type="button" className="monitor-action monitor-action--icon monitor-action--danger" aria-label={`Delete ${rule.name}`} onClick={() => onDelete(rule)}>
                <Trash2 size={16} />
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function AlertHistory({ events }: { readonly events: ReadonlyArray<AlertEvent> }) {
  if (events.length === 0) {
    return <section className="card alerts-empty"><h2>No alert history yet</h2><p>Firing and recovery events will appear after rule evaluation.</p></section>;
  }

  return (
    <section className="alerts-history card" aria-label="Alert history">
      <table>
        <thead><tr><th>Time</th><th>Monitor</th><th>Event</th><th>Notification</th></tr></thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <td>{new Date(event.created_at * 1000).toLocaleString()}</td>
              <td>{event.monitor_name}</td>
              <td>{event.event_type}</td>
              <td>{event.notification_status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function conditionsForMonitor(monitor: Monitor): AlertCondition[] {
  if (monitor.type === 'agent') return ['offline', 'latency', 'cpu', 'memory'];
  if (monitor.type === 'http') return ['offline', 'latency', 'http_status'];
  return ['offline', 'latency'];
}

function paramsForCondition(condition: AlertCondition, formData: FormData): Record<string, unknown> {
  if (condition === 'latency') return { threshold_ms: Number(formData.get('threshold_ms') ?? 1000) };
  if (condition === 'http_status') return { expected_status: Number(formData.get('expected_status') ?? 200) };
  if (condition === 'cpu' || condition === 'memory') return { threshold_percent: Number(formData.get('threshold_percent') ?? 90) };
  return {};
}

