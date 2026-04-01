import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
const settingsApi = new Hono();
async function calculateHash(input) {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
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
        const hash = await calculateHash(password);
        await db.batch([
            db.prepare("INSERT OR REPLACE INTO kv_settings (key, value) VALUES ('ui_lock_hash', ?)").bind(hash),
            db.prepare("INSERT OR REPLACE INTO kv_settings (key, value) VALUES ('ui_lock_enabled', 'true')").bind()
        ]);
    }
    else {
        // We only disable the lock, leaving the old hash intact (it will be ignored anyway)
        await db.prepare("INSERT OR REPLACE INTO kv_settings (key, value) VALUES ('ui_lock_enabled', 'false')").bind().run();
    }
    return c.json({ success: true });
});
export { settingsApi };
