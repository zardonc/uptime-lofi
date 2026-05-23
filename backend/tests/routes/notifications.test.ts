import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import app from "../../src/index";

describe("Internal Notification Routes (/api/internal/v1/notifications)", () => {
  let testEnv: any;
  const db = (env as any).DB;

  beforeEach(async () => {
    testEnv = {
      ...env,
      API_SECRET_KEY: "test_admin_key",
      INTERNAL_API_KEY: "test_internal_key",
      SESSION_BLACKLIST: {
        store: new Map(),
        async get(key: string) { return this.store.get(key) || null; },
      },
    };

    await db.prepare("DELETE FROM alert_notification_deliveries").run();
    await db.prepare("DELETE FROM notification_channels").run();
  });

  const request = (path: string, init: RequestInit = {}) => app.fetch(
    new Request(`http://localhost${path}`, {
      ...init,
      headers: {
        "x-uptime-lofi-internal-key": "test_internal_key",
        "Content-Type": "application/json",
        ...init.headers,
      },
    }),
    testEnv,
  );

  it("creates webhook channels without returning secret headers", async () => {
    const created = await request("/api/internal/v1/notifications/channels", {
      method: "POST",
      body: JSON.stringify({
        type: "webhook",
        name: "Ops webhook",
        config: {
          url: "https://hooks.example.test/alerts",
          headers: { "x-alert-secret": "raw-header-secret" },
        },
      }),
    });

    expect(created.status).toBe(200);
    const body = (await created.json()) as any;
    expect(body.data).toMatchObject({
      name: "Ops webhook",
      type: "webhook",
      enabled: true,
      has_secret: true,
      redacted_label: "https://hooks.example.test/alerts",
    });
    expect(JSON.stringify(body)).not.toContain("raw-header-secret");

    const stored = await db.prepare("SELECT config_json FROM notification_channels WHERE id = ?")
      .bind(body.data.id)
      .first() as { config_json: string } | null;
    expect(stored?.config_json).toContain("raw-header-secret");
  });

  it("creates telegram channels without returning the bot token", async () => {
    const created = await request("/api/internal/v1/notifications/channels", {
      method: "POST",
      body: JSON.stringify({
        type: "telegram",
        name: "SRE bot",
        config: {
          bot_token: "123456:raw-telegram-token",
          chat_id: "-1001234567890",
        },
      }),
    });

    expect(created.status).toBe(200);
    const body = (await created.json()) as any;
    expect(body.data).toMatchObject({
      name: "SRE bot",
      type: "telegram",
      enabled: true,
      has_secret: true,
      redacted_label: "chat ****7890",
    });
    expect(JSON.stringify(body)).not.toContain("raw-telegram-token");

    const listed = await request("/api/internal/v1/notifications/channels");
    expect(JSON.stringify(await listed.json())).not.toContain("raw-telegram-token");
  });

  it("keeps email reserved and unavailable for sending", async () => {
    const rejected = await request("/api/internal/v1/notifications/channels", {
      method: "POST",
      body: JSON.stringify({
        type: "email",
        name: "Email later",
        enabled: true,
        config: {},
      }),
    });
    expect(rejected.status).toBe(400);

    const created = await request("/api/internal/v1/notifications/channels", {
      method: "POST",
      body: JSON.stringify({
        type: "email",
        name: "Email later",
        enabled: false,
        config: {},
      }),
    });
    expect(created.status).toBe(200);
    const channel = ((await created.json()) as any).data;
    expect(channel).toMatchObject({
      type: "email",
      enabled: false,
      delivery_status: "disabled",
      redacted_label: "Coming soon",
    });

    const tested = await request(`/api/internal/v1/notifications/channels/${channel.id}/test`, { method: "POST" });
    expect(tested.status).toBe(400);
  });
});
