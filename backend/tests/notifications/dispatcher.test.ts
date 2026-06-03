import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:workers";
import { dispatchAlertEvent } from "../../src/services/notificationDispatcher";

describe("notificationDispatcher", () => {
  const db = (env as any).DB;

  beforeEach(async () => {
    await db.prepare("DELETE FROM alert_notification_deliveries").run();
    await db.prepare("DELETE FROM notification_channels").run();
    await db.prepare("DELETE FROM alert_events").run();
    await db.prepare("DELETE FROM alert_rule_state").run();
    await db.prepare("DELETE FROM alert_rules").run();
    await db.prepare("DELETE FROM monitor_latest").run();
    await db.prepare("DELETE FROM monitors").run();
  });

  it("sends webhook alert payloads and records success", async () => {
    await insertMonitor();
    await insertChannel("webhook-1", "webhook", {
      url: "https://hooks.example.test/alerts",
      headers: { "x-alert-secret": "secret-value" },
    });
    await insertRule(["webhook-1"]);
    await insertEvent("event-1");

    const fetchImpl = vi.fn(async () => new Response("ok", { status: 202 })) as unknown as typeof fetch;
    const results = await dispatchAlertEvent(db, "event-1", { fetchImpl });

    expect(results).toEqual([expect.objectContaining({ channel_id: "webhook-1", status: "sent", status_code: 202 })]);
    expect(fetchImpl).toHaveBeenCalledWith("https://hooks.example.test/alerts", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "x-alert-secret": "secret-value" }),
    }));
    const body = JSON.parse(String((fetchImpl as any).mock.calls[0][1].body));
    expect(body).toMatchObject({ event_id: "event-1", rule_name: "Homepage offline", monitor_name: "Homepage" });

    const delivery = await db.prepare("SELECT status FROM alert_notification_deliveries WHERE event_id = 'event-1'").first("status");
    expect(delivery).toBe("sent");
  });

  it("sends Telegram messages through the Bot API", async () => {
    await insertMonitor();
    await insertChannel("telegram-1", "telegram", {
      bot_token: "123456:telegram-token",
      chat_id: "-1001234567890",
    });
    await insertRule(["telegram-1"]);
    await insertEvent("event-1");

    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as unknown as typeof fetch;
    const results = await dispatchAlertEvent(db, "event-1", { fetchImpl });

    expect(results[0]).toMatchObject({ channel_id: "telegram-1", status: "sent" });
    const [url, init] = (fetchImpl as any).mock.calls[0];
    expect(url).toBe("https://api.telegram.org/bot123456:telegram-token/sendMessage");
    expect(String(init.body)).toContain("chat_id=-1001234567890");
    expect(String(init.body)).toContain("Homepage+is+offline");
  });

  it("records failed delivery without throwing", async () => {
    await insertMonitor();
    await insertChannel("webhook-1", "webhook", { url: "https://hooks.example.test/alerts", headers: {} });
    await insertRule(["webhook-1"]);
    await insertEvent("event-1");

    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    const results = await dispatchAlertEvent(db, "event-1", { fetchImpl });

    expect(results[0]).toMatchObject({
      channel_id: "webhook-1",
      status: "failed",
      status_code: 500,
      error_message: "Webhook returned HTTP 500",
    });
    expect(await db.prepare("SELECT status FROM alert_notification_deliveries").first("status")).toBe("failed");
  });

  async function insertMonitor() {
    await db.prepare(
      `INSERT INTO monitors (
         id, backend_id, name, type, target, interval_sec, timeout_sec,
         expected_json, config_json, paused, public_visible, created_at, updated_at
       ) VALUES ('http-1', 'default', 'Homepage', 'http', 'Homepage', 60, 10, NULL, '{}', 0, 1, 1, 1)`,
    ).run();
  }

  async function insertChannel(id: string, type: "webhook" | "telegram" | "email", config: Record<string, unknown>) {
    await db.prepare(
      `INSERT INTO notification_channels (
         id, backend_id, type, name, config_json, enabled, last_test_status, created_at, updated_at
       ) VALUES (?, 'default', ?, ?, ?, 1, 'untested', 1, 1)`,
    ).bind(id, type, `${type} channel`, JSON.stringify(config)).run();
  }

  async function insertRule(channelIds: string[]) {
    await db.prepare(
      `INSERT INTO alert_rules (
         id, backend_id, name, monitor_id, condition, params_json, channel_ids_json,
         enabled, severity, confirm_for_sec, repeat_interval_sec, silent_hours_json,
         timezone, created_at, updated_at
       ) VALUES ('rule-1', 'default', 'Homepage offline', 'http-1', 'offline', '{}', ?, 1, 'critical', 0, 3600, NULL, 'UTC', 1, 1)`,
    ).bind(JSON.stringify(channelIds)).run();
  }

  async function insertEvent(id: string) {
    await db.prepare(
      `INSERT INTO alert_events (
         id, rule_id, monitor_id, event_type, severity, message, dedupe_key,
         notification_status, created_at, detail_json
       ) VALUES (?, 'rule-1', 'http-1', 'firing', 'critical', 'Homepage is offline', 'dedupe-1', 'pending', 1, '{}')`,
    ).bind(id).run();
  }
});
