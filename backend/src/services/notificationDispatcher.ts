type NotificationChannelType = "webhook" | "telegram" | "email";
type DeliveryStatus = "sent" | "failed" | "skipped" | "not_implemented";

type DispatchOptions = {
  readonly fetchImpl?: typeof fetch;
};

type AlertEventDispatchRow = {
  id: string;
  rule_id: string;
  monitor_id: string;
  event_type: "pending" | "firing" | "suppressed" | "recovered";
  severity: "info" | "warning" | "critical";
  message: string;
  notification_status: "pending" | "suppressed" | "not_required";
  detail_json: string;
  created_at: number;
  rule_name: string;
  monitor_name: string;
  channel_ids_json: string;
};

type NotificationChannelRow = {
  id: string;
  type: NotificationChannelType;
  name: string;
  config_json: string;
  enabled: number;
};

export type NotificationDeliveryResult = {
  readonly channel_id: string;
  readonly channel_type: NotificationChannelType | "unknown";
  readonly status: DeliveryStatus;
  readonly status_code: number | null;
  readonly error_message: string | null;
};

export async function dispatchAlertEvent(
  db: D1Database,
  eventId: string,
  options: DispatchOptions = {},
): Promise<ReadonlyArray<NotificationDeliveryResult>> {
  const event = await getEvent(db, eventId);
  if (!event || event.notification_status !== "pending") return [];

  const channelIds = safeJsonArray(event.channel_ids_json);
  if (channelIds.length === 0) {
    await updateEventDeliverySummary(db, event, []);
    return [];
  }

  const channels = await getChannels(db, channelIds);
  const byId = new Map(channels.map((channel) => [channel.id, channel]));
  const results: NotificationDeliveryResult[] = [];

  for (const channelId of channelIds) {
    const channel = byId.get(channelId);
    const result = channel
      ? await dispatchChannel(channel, event, options.fetchImpl ?? fetch)
      : missingChannelResult(channelId);
    await recordDelivery(db, event.id, result, event.created_at);
    results.push(result);
  }

  await updateEventDeliverySummary(db, event, results);
  return results;
}

async function dispatchChannel(
  channel: NotificationChannelRow,
  event: AlertEventDispatchRow,
  fetchImpl: typeof fetch,
): Promise<NotificationDeliveryResult> {
  if (channel.enabled !== 1) {
    return result(channel, "skipped", null, "Channel is disabled");
  }
  if (channel.type === "email") {
    return result(channel, "not_implemented", null, "Email notifications are reserved for a future phase");
  }

  try {
    if (channel.type === "webhook") return await dispatchWebhook(channel, event, fetchImpl);
    return await dispatchTelegram(channel, event, fetchImpl);
  } catch (error) {
    return result(channel, "failed", null, error instanceof Error ? error.message : String(error));
  }
}

async function dispatchWebhook(channel: NotificationChannelRow, event: AlertEventDispatchRow, fetchImpl: typeof fetch) {
  const config = safeJson(channel.config_json);
  const url = typeof config.url === "string" ? config.url : "";
  if (!url) return result(channel, "failed", null, "Webhook URL is missing");

  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...plainStringRecord(config.headers),
    },
    body: JSON.stringify(alertPayload(event)),
  });
  return result(channel, response.ok ? "sent" : "failed", response.status, response.ok ? null : `Webhook returned HTTP ${response.status}`);
}

async function dispatchTelegram(channel: NotificationChannelRow, event: AlertEventDispatchRow, fetchImpl: typeof fetch) {
  const config = safeJson(channel.config_json);
  const botToken = typeof config.bot_token === "string" ? config.bot_token : "";
  const chatId = typeof config.chat_id === "string" ? config.chat_id : "";
  if (!botToken || !chatId) return result(channel, "failed", null, "Telegram bot token or chat ID is missing");

  const body = new URLSearchParams({
    chat_id: chatId,
    text: `${event.severity.toUpperCase()}: ${event.message}`,
    disable_web_page_preview: "true",
  });
  const response = await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return result(channel, response.ok ? "sent" : "failed", response.status, response.ok ? null : `Telegram returned HTTP ${response.status}`);
}

function alertPayload(event: AlertEventDispatchRow) {
  return {
    event_id: event.id,
    rule_id: event.rule_id,
    rule_name: event.rule_name,
    monitor_id: event.monitor_id,
    monitor_name: event.monitor_name,
    event_type: event.event_type,
    severity: event.severity,
    message: event.message,
    created_at: event.created_at,
  };
}

async function getEvent(db: D1Database, eventId: string): Promise<AlertEventDispatchRow | null> {
  return db.prepare(
    `SELECT e.id, e.rule_id, e.monitor_id, e.event_type, e.severity, e.message,
            e.notification_status, e.detail_json, e.created_at,
            r.name AS rule_name, m.name AS monitor_name, r.channel_ids_json
     FROM alert_events e
     JOIN alert_rules r ON r.id = e.rule_id
     JOIN monitors m ON m.id = e.monitor_id
     WHERE e.id = ?
     LIMIT 1`,
  ).bind(eventId).first<AlertEventDispatchRow>();
}

async function getChannels(db: D1Database, channelIds: ReadonlyArray<string>): Promise<NotificationChannelRow[]> {
  if (channelIds.length === 0) return [];
  const placeholders = channelIds.map(() => "?").join(",");
  const { results } = await db.prepare(
    `SELECT id, type, name, config_json, enabled
     FROM notification_channels
     WHERE archived_at IS NULL AND id IN (${placeholders})`,
  ).bind(...channelIds).all<NotificationChannelRow>();
  return results;
}

async function recordDelivery(db: D1Database, eventId: string, delivery: NotificationDeliveryResult, attemptedAt: number) {
  await db.prepare(
    `INSERT INTO alert_notification_deliveries (
       id, event_id, channel_id, channel_type, status, status_code, error_message, attempted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    `notif_delivery_${attemptedAt}_${crypto.randomUUID()}`,
    eventId,
    delivery.channel_id,
    delivery.channel_type,
    delivery.status,
    delivery.status_code,
    delivery.error_message,
    attemptedAt,
  ).run();
}

async function updateEventDeliverySummary(
  db: D1Database,
  event: AlertEventDispatchRow,
  deliveries: ReadonlyArray<NotificationDeliveryResult>,
) {
  const detail = safeJson(event.detail_json);
  await db.prepare("UPDATE alert_events SET detail_json = ? WHERE id = ?")
    .bind(JSON.stringify({
      ...detail,
      notification_deliveries: deliveries.map((delivery) => ({
        channel_id: delivery.channel_id,
        channel_type: delivery.channel_type,
        status: delivery.status,
        status_code: delivery.status_code,
        error_message: delivery.error_message,
      })),
    }), event.id)
    .run();
}

function result(
  channel: NotificationChannelRow,
  status: DeliveryStatus,
  statusCode: number | null,
  errorMessage: string | null,
): NotificationDeliveryResult {
  return {
    channel_id: channel.id,
    channel_type: channel.type,
    status,
    status_code: statusCode,
    error_message: errorMessage,
  };
}

function missingChannelResult(channelId: string): NotificationDeliveryResult {
  return {
    channel_id: channelId,
    channel_type: "unknown",
    status: "failed",
    status_code: null,
    error_message: "Notification channel was not found",
  };
}

function safeJson(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function safeJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function plainStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[0].trim().length > 0),
  );
}
