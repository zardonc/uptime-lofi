import { describe, expect, it } from "vitest";
import {
  monitorSchema,
  notificationChannelSchema,
  publicStatusResponseSchema,
  structuredError,
  structuredErrorSchema,
} from "../../src/schemas/v2";

const source = {
  backend_id: "default",
  backend_label: "Default backend",
  backend_type: "cloudflare_worker" as const,
};

describe("v2 contracts", () => {
  it("requires backend source metadata on monitors", () => {
    const monitor = monitorSchema.parse({
      ...source,
      id: "mon_1",
      name: "Main HTTP",
      type: "http",
      status: "online",
      target: { label: "https://example.com", url: "https://example.com" },
      latest: {
        checked_at: 1_800_000_000,
        latency_ms: 123,
        uptime_ratio: 99.95,
        cpu_percent: null,
        mem_percent: null,
        error_text: null,
      },
      visibility: {
        public: true,
        show_uptime: true,
        show_latency: true,
        show_incidents: false,
      },
      created_at: 1_800_000_000,
      updated_at: 1_800_000_030,
    });

    expect(monitor.backend_id).toBe("default");
    expect(() => monitorSchema.parse({ ...monitor, backend_id: undefined })).toThrow();
  });

  it("rejects secret-like fields from public status monitor DTOs", () => {
    const publicStatus = {
      status: "online",
      message: "All systems operational",
      updated_at: 1_800_000_000,
      monitors: [{
        ...source,
        id: "mon_1",
        name: "Public HTTP",
        type: "http",
        status: "online",
        target_label: "Public endpoint",
        latency_ms: 84,
        uptime_ratio: 100,
        updated_at: 1_800_000_000,
      }],
      incidents: [],
    };

    expect(publicStatusResponseSchema.parse(publicStatus).monitors[0].backend_id).toBe("default");
    expect(() => publicStatusResponseSchema.parse({
      ...publicStatus,
      monitors: [{ ...publicStatus.monitors[0], api_key: "secret" }],
    })).toThrow();
    expect(() => publicStatusResponseSchema.parse({
      ...publicStatus,
      monitors: [{ ...publicStatus.monitors[0], monitor_secret: "secret" }],
    })).toThrow();
  });

  it("allows notification secret metadata without exposing raw secrets", () => {
    const channel = notificationChannelSchema.parse({
      ...source,
      id: "chan_1",
      name: "Ops Telegram",
      type: "telegram",
      enabled: true,
      has_secret: true,
      redacted_label: "bot:...1234",
      delivery_status: "untested",
      updated_at: 1_800_000_000,
    });

    expect(channel.has_secret).toBe(true);
    expect(() => notificationChannelSchema.parse({ ...channel, bot_token: "123:raw-token" })).toThrow();
    expect(() => notificationChannelSchema.parse({ ...channel, headers: { "x-secret": "raw" } })).toThrow();
  });

  it("keeps the structured error helper shape stable", () => {
    const body = structuredError("not_found", "Monitor not found", "req_123");

    expect(structuredErrorSchema.parse(body)).toEqual({
      error: {
        code: "not_found",
        message: "Monitor not found",
        request_id: "req_123",
      },
    });
  });
});
