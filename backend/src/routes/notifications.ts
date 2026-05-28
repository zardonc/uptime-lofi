import { Hono } from "hono";
import type { Context } from "hono";
import type { Bindings } from "./api";
import {
  createNotificationChannelSchema,
  structuredError,
  updateNotificationChannelSchema,
  type BackendSource,
  type CreateNotificationChannelInput,
  type NotificationChannelType,
} from "../schemas/v2";

const notificationsApi = new Hono<{ Bindings: Bindings }>();

type NotificationChannelRow = {
  id: string;
  backend_id: string;
  type: NotificationChannelType;
  name: string;
  config_json: string;
  enabled: number;
  last_test_status: "untested" | "ok" | "failing" | "disabled";
  updated_at: number;
};

type NotificationContext = Context<{ Bindings: Bindings }>;

notificationsApi.get("/channels", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, backend_id, type, name, config_json, enabled, last_test_status, updated_at
     FROM notification_channels
     WHERE archived_at IS NULL
     ORDER BY updated_at DESC`,
  ).all<NotificationChannelRow>();

  return c.json({ data: results.map((row) => toChannel(row, backendSource(c.req.header("x-uptime-lofi-backend-id")))) });
});

notificationsApi.post("/channels", async (c) => {
  const parsed = createNotificationChannelSchema.safeParse(await readJson(c.req.raw));
  if (!parsed.success) return c.json(structuredError("invalid_notification_channel", "Invalid notification channel payload"), 400);

  const validation = validateChannel(parsed.data);
  if (validation) return c.json(structuredError("invalid_notification_channel", validation), 400);

  const now = nowSeconds();
  const id = `notif_${crypto.randomUUID()}`;
  const enabled = parsed.data.type === "email" ? false : parsed.data.enabled;
  await c.env.DB.prepare(
    `INSERT INTO notification_channels (
       id, backend_id, type, name, config_json, enabled,
       last_test_status, created_at, updated_at
     ) VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    parsed.data.type,
    parsed.data.name,
    JSON.stringify(normalizeConfig(parsed.data.type, parsed.data.config)),
    enabled ? 1 : 0,
    parsed.data.type === "email" ? "disabled" : "untested",
    now,
    now,
  ).run();

  const row = await getChannel(c.env.DB, id);
  return c.json({ data: toChannel(row!, backendSource(c.req.header("x-uptime-lofi-backend-id"))) });
});

notificationsApi.put("/channels/:id", async (c) => {
  const id = c.req.param("id") ?? "";
  const existing = await getChannel(c.env.DB, id);
  if (!existing) return c.json(structuredError("notification_channel_not_found", "Notification channel not found"), 404);

  const parsed = updateNotificationChannelSchema.safeParse(await readJson(c.req.raw));
  if (!parsed.success) return c.json(structuredError("invalid_notification_channel_update", "Invalid notification channel update"), 400);

  const nextConfig = parsed.data.config === undefined
    ? safeJson(existing.config_json)
    : normalizeConfig(existing.type, parsed.data.config);
  const nextEnabled = existing.type === "email" ? false : parsed.data.enabled ?? existing.enabled === 1;
  const validation = validateChannel({
    type: existing.type,
    name: parsed.data.name ?? existing.name,
    enabled: nextEnabled,
    config: nextConfig,
  });
  if (validation) return c.json(structuredError("invalid_notification_channel", validation), 400);

  await c.env.DB.prepare(
    `UPDATE notification_channels
     SET name = ?, config_json = ?, enabled = ?, last_test_status = ?, updated_at = ?
     WHERE id = ? AND archived_at IS NULL`,
  ).bind(
    parsed.data.name ?? existing.name,
    JSON.stringify(nextConfig),
    nextEnabled ? 1 : 0,
    existing.type === "email" ? "disabled" : existing.last_test_status,
    nowSeconds(),
    id,
  ).run();

  const row = await getChannel(c.env.DB, id);
  return c.json({ data: toChannel(row!, backendSource(c.req.header("x-uptime-lofi-backend-id"))) });
});

notificationsApi.delete("/channels/:id", async (c) => {
  const id = c.req.param("id") ?? "";
  const existing = await getChannel(c.env.DB, id);
  if (!existing) return c.json(structuredError("notification_channel_not_found", "Notification channel not found"), 404);

  await c.env.DB.prepare("UPDATE notification_channels SET archived_at = ?, enabled = 0, updated_at = ? WHERE id = ?")
    .bind(nowSeconds(), nowSeconds(), id)
    .run();
  return c.json({ data: toChannel({ ...existing, enabled: 0 }, backendSource(c.req.header("x-uptime-lofi-backend-id"))) });
});

notificationsApi.post("/channels/:id/test", async (c) => {
  const row = await getChannel(c.env.DB, c.req.param("id") ?? "");
  if (!row) return c.json(structuredError("notification_channel_not_found", "Notification channel not found"), 404);
  if (row.type === "email") {
    return c.json(structuredError("notification_email_reserved", "Email notifications are reserved for a future phase"), 400);
  }

  await c.env.DB.prepare(
    `UPDATE notification_channels
     SET last_test_status = ?, last_test_message = ?, last_tested_at = ?, updated_at = ?
     WHERE id = ?`,
  ).bind("ok", "Configuration accepted for test delivery", nowSeconds(), nowSeconds(), row.id).run();

  const updated = await getChannel(c.env.DB, row.id);
  return c.json({ data: toChannel(updated!, backendSource(c.req.header("x-uptime-lofi-backend-id"))) });
});

async function getChannel(db: D1Database, id: string): Promise<NotificationChannelRow | null> {
  return db.prepare(
    `SELECT id, backend_id, type, name, config_json, enabled, last_test_status, updated_at
     FROM notification_channels
     WHERE id = ? AND archived_at IS NULL
     LIMIT 1`,
  ).bind(id).first<NotificationChannelRow>();
}

function validateChannel(input: CreateNotificationChannelInput): string | null {
  const config = input.config;
  if (input.type === "email") {
    return input.enabled ? "Email is reserved and cannot be enabled in this phase" : null;
  }
  if (input.type === "webhook") {
    return typeof config.url === "string" && /^https?:\/\//.test(config.url)
      ? null
      : "Webhook channels require an http(s) URL";
  }
  if (input.type === "telegram") {
    return typeof config.bot_token === "string" && config.bot_token.trim() && typeof config.chat_id === "string" && config.chat_id.trim()
      ? null
      : "Telegram channels require a bot token and chat ID";
  }
  return null;
}

function normalizeConfig(type: NotificationChannelType, config: Record<string, unknown>): Record<string, unknown> {
  if (type === "webhook") {
    return {
      url: String(config.url ?? ""),
      headers: plainStringRecord(config.headers),
    };
  }
  if (type === "telegram") {
    return {
      bot_token: String(config.bot_token ?? ""),
      chat_id: String(config.chat_id ?? ""),
    };
  }
  return {};
}

function toChannel(row: NotificationChannelRow, source: BackendSource) {
  const config = safeJson(row.config_json);
  return {
    ...source,
    backend_id: row.backend_id || source.backend_id,
    id: row.id,
    name: row.name,
    type: row.type,
    enabled: row.enabled === 1,
    has_secret: hasSecret(row.type, config),
    redacted_label: redactedLabel(row.type, config),
    delivery_status: row.enabled === 1 ? row.last_test_status : "disabled",
    updated_at: row.updated_at,
  };
}

function hasSecret(type: NotificationChannelType, config: Record<string, unknown>): boolean {
  if (type === "telegram") return Boolean(config.bot_token);
  if (type === "webhook") return Object.keys(plainStringRecord(config.headers)).length > 0;
  return false;
}

function redactedLabel(type: NotificationChannelType, config: Record<string, unknown>): string | null {
  if (type === "telegram") return typeof config.chat_id === "string" ? `chat ${maskTail(config.chat_id)}` : null;
  if (type === "webhook" && typeof config.url === "string") {
    try {
      const url = new URL(config.url);
      return `${url.origin}${url.pathname === "/" ? "" : url.pathname}`;
    } catch {
      return "Webhook endpoint";
    }
  }
  if (type === "email") return "Coming soon";
  return null;
}

function maskTail(value: string): string {
  return value.length <= 4 ? "****" : `****${value.slice(-4)}`;
}

function backendSource(backendId?: string): BackendSource {
  return {
    backend_id: backendId || "default",
    backend_label: "Default backend",
    backend_type: "cloudflare_worker",
  };
}

async function readJson(request: Request) {
  return request.json().catch(() => null);
}

function safeJson(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function plainStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[0].trim().length > 0),
  );
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export { notificationsApi };
