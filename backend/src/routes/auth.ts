import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sign } from "hono/jwt";
import { getCookie } from "hono/cookie";

const authApi = new Hono<{ Bindings: { DB: D1Database; API_SECRET_KEY: string } }>();

async function calculateHash(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

authApi.post("/setup", zValidator("json", z.object({ admin_key: z.string(), new_ui_password: z.string() })), async (c) => {
  const { admin_key, new_ui_password } = c.req.valid("json");
  if (admin_key !== c.env.API_SECRET_KEY) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const hash = await calculateHash(new_ui_password);
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT OR REPLACE INTO kv_settings (key, value) VALUES ('ui_lock_hash', ?)").bind(hash),
    c.env.DB.prepare("INSERT OR REPLACE INTO kv_settings (key, value) VALUES ('ui_lock_enabled', 'true')").bind()
  ]);

  return c.json({ success: true, message: "UI Lock enabled" });
});

authApi.post("/unlock", zValidator("json", z.object({ admin_key: z.string() })), async (c) => {
  const { admin_key } = c.req.valid("json");
  if (admin_key !== c.env.API_SECRET_KEY) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await c.env.DB.prepare("INSERT OR REPLACE INTO kv_settings (key, value) VALUES ('ui_lock_enabled', 'false')").bind().run();
  
  return c.json({ success: true, message: "UI Lock disabled" });
});

authApi.post("/login", zValidator("json", z.object({ password: z.string() })), async (c) => {
  const { password } = c.req.valid("json");
  const db = c.env.DB;

  const isEnabledRecord = await db.prepare("SELECT value FROM kv_settings WHERE key = 'ui_lock_enabled'").first<{ value: string }>();
  const isUiLockEnabled = isEnabledRecord?.value === 'true';

  let isValid = false;

  if (isUiLockEnabled) {
    const hashRecord = await db.prepare("SELECT value FROM kv_settings WHERE key = 'ui_lock_hash'").first<{ value: string }>();
    const inputHash = await calculateHash(password);
    isValid = (inputHash === hashRecord?.value);

    if (!isValid && password === c.env.API_SECRET_KEY) {
      isValid = true; // Break-glass with master key
    }
  } else {
    isValid = (password === c.env.API_SECRET_KEY);
  }

  if (!isValid) return c.json({ error: "Unauthorized" }, 401);

  const sessionId = crypto.randomUUID();
  const rawRefreshToken = crypto.randomUUID() + crypto.randomUUID();
  const refreshTokenHash = await calculateHash(rawRefreshToken);

  const expiresAt = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60);

  await db.prepare("INSERT INTO refresh_tokens (token_hash, session_id, status, expires_at) VALUES (?, ?, 'active', ?)")
    .bind(refreshTokenHash, sessionId, expiresAt)
    .run();
  
  const jwt = await sign({
      session_id: sessionId,
      role: 'admin',
      exp: Math.floor(Date.now() / 1000) + (15 * 60)
  }, c.env.API_SECRET_KEY);

  c.header('Set-Cookie', `refresh_token=${rawRefreshToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${7*24*60*60}`);

  return c.json({ access_token: jwt });
});

authApi.post("/refresh", async (c) => {
  const rawRefreshToken = getCookie(c, "refresh_token");
  if (!rawRefreshToken) return c.json({ error: "Missing refresh token" }, 401);

  const hash = await calculateHash(rawRefreshToken);
  const db = c.env.DB;
  
  const tokenRecord = await db.prepare("SELECT id, session_id, status, expires_at FROM refresh_tokens WHERE token_hash = ?").bind(hash).first<{
    id: number, session_id: string, status: string, expires_at: number
  }>();

  if (!tokenRecord) return c.json({ error: "Invalid token" }, 401);

  if (tokenRecord.status === 'rotated') {
    await db.prepare("UPDATE refresh_tokens SET status = 'revoked' WHERE session_id = ?").bind(tokenRecord.session_id).run();
    return c.json({ error: "Token reuse detected. Session revoked." }, 401);
  }
  
  if (tokenRecord.status !== 'active') return c.json({ error: "Token is disabled" }, 401);
  if (Math.floor(Date.now() / 1000) > tokenRecord.expires_at) return c.json({ error: "Token expired" }, 401);

  const newRawRefreshToken = crypto.randomUUID() + crypto.randomUUID();
  const newHash = await calculateHash(newRawRefreshToken);
  const newExpiresAt = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60);

  // We explicitly log rotation hierarchy
  await db.batch([
    db.prepare("INSERT INTO refresh_tokens (token_hash, session_id, status, expires_at) VALUES (?, ?, 'active', ?)").bind(newHash, tokenRecord.session_id, newExpiresAt),
    db.prepare("UPDATE refresh_tokens SET status = 'rotated' WHERE id = ?").bind(tokenRecord.id)
  ]);

  const jwt = await sign({
      session_id: tokenRecord.session_id,
      role: 'admin',
      exp: Math.floor(Date.now() / 1000) + (15 * 60)
  }, c.env.API_SECRET_KEY);

  c.header('Set-Cookie', `refresh_token=${newRawRefreshToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${7*24*60*60}`);

  return c.json({ access_token: jwt });
});

export { authApi };
