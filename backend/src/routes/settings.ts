import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { hashPassword, generateSalt } from "../utils/crypto";

const settingsApi = new Hono<{ Bindings: { DB: D1Database; API_SECRET_KEY: string } }>();

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

export { settingsApi };
