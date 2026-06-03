import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { hashPassword, generateSalt } from "../utils/crypto";
import {
  listPublicMonitorVisibility,
  readPublicStatusSettings,
  savePublicStatusSettings,
  updatePublicMonitorVisibility,
} from "../services/publicStatusService";

const settingsApi = new Hono<{ Bindings: { DB: D1Database; API_SECRET_KEY: string } }>();

settingsApi.get("/", async (c) => {
  const db = c.env.DB;
  const uiLock = await db.prepare("SELECT value FROM kv_settings WHERE key = 'ui_lock_enabled'").first<{ value: string }>();

  return c.json({
    data: {
      is_ui_lock_enabled: uiLock?.value === "true",
      public_status: await readPublicStatusSettings(db),
    },
  });
});

settingsApi.post("/security", zValidator("json", z.object({ 
  enabled: z.boolean(), 
  password: z.string().optional() 
})), async (c) => {
  const { enabled, password } = c.req.valid("json");
  const db = c.env.DB;

  if (enabled) {
    if (!password || password.length === 0) {
      return c.json({ error: "Password is required to enable UI Lock" }, 400);
    }
    const salt = generateSalt(16);
    const hash = await hashPassword(password, salt);
    await db.batch([
      db.prepare("INSERT OR REPLACE INTO kv_settings (key, value) VALUES ('ui_lock_hash', ?)").bind(hash),
      db.prepare("INSERT OR REPLACE INTO kv_settings (key, value) VALUES ('ui_lock_salt', ?)").bind(salt),
      db.prepare("INSERT OR REPLACE INTO kv_settings (key, value) VALUES ('ui_lock_enabled', 'true')").bind()
    ]);
  } else {
    // We only disable the lock, leaving the old hash intact (it will be ignored anyway)
    await db.prepare("INSERT OR REPLACE INTO kv_settings (key, value) VALUES ('ui_lock_enabled', 'false')").bind().run();
  }

  return c.json({ success: true });
});

settingsApi.post("/public-status", zValidator("json", z.object({
  enabled: z.boolean(),
  private_slug: z.string().trim().max(80).nullable().optional(),
  show_uptime: z.boolean(),
  show_latency: z.boolean(),
  show_incidents: z.boolean(),
  show_monitor_type: z.boolean(),
  monitors: z.array(z.object({
    id: z.string().trim().min(1),
    public_visible: z.boolean(),
  }).strict()).optional().default([]),
}).strict()), async (c) => {
  const { monitors, ...settings } = c.req.valid("json");
  const db = c.env.DB;

  const publicStatus = await savePublicStatusSettings(db, settings);
  await updatePublicMonitorVisibility(db, monitors);

  return c.json({ data: { public_status: publicStatus, monitors: await listPublicMonitorVisibility(db) } });
});

export { settingsApi };
