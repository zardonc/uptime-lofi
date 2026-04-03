import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sign } from "hono/jwt";
import { getCookie } from "hono/cookie";
import { strictRateLimit } from "../middleware/rateLimiter";
import { dashboardAuthMiddleware } from "../middleware/dashboardAuth";

const authApi = new Hono<{ Bindings: { DB: D1Database; API_SECRET_KEY: string } }>();

// Apply strict rate limiting to login endpoint
authApi.use("/login", strictRateLimit);

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

authApi.get("/status", async (c) => {
  const db = c.env.DB;
  const isEnabledRecord = await db.prepare("SELECT value FROM kv_settings WHERE key = 'ui_lock_enabled'").first<{ value: string }>();
  return c.json({ is_ui_lock_enabled: isEnabledRecord?.value === 'true' });
});

authApi.post("/unlock", zValidator("json", z.object({ admin_key: z.string() })), async (c) => {
  const { admin_key } = c.req.valid("json");
  if (admin_key !== c.env.API_SECRET_KEY) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await c.env.DB.prepare("INSERT OR REPLACE INTO kv_settings (key, value) VALUES ('ui_lock_enabled', 'false')").bind().run();
  
	return c.json({ success: true, message: "UI Lock disabled" });
});

// D1-based login failure tracking (cross-instance rate limiting)
// Rate limit: 5 attempts per 15 minutes per IP

authApi.post("/login", zValidator("json", z.object({ password: z.string() })), async (c) => {
	const { password } = c.req.valid("json");
	const db = c.env.DB;

	// Extract client IP early for rate limiting and audit logging
	const clientIp = (c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown").split(",")[0].trim();
	const now = Math.floor(Date.now() / 1000);
	const windowStart = now - 900; // 15 minutes

	// Check and track failed login attempts using D1 (cross-instance)
	const attempt = await db.prepare(
		`SELECT attempt_count, first_attempt_at FROM login_attempts
		WHERE ip_address = ? AND last_attempt_at > ?`
	).bind(clientIp, windowStart).first<{ attempt_count: number; first_attempt_at: number }>();

	if (attempt && attempt.attempt_count >= 5) {
		const resetIn = attempt.first_attempt_at + 900 - now;
		return c.json({
			error: "Too many failed attempts",
			retry_after: resetIn
		}, 429);
	}

	const isEnabledRecord = await db.prepare("SELECT value FROM kv_settings WHERE key = 'ui_lock_enabled'").first<{ value: string }>();
	const isUiLockEnabled = isEnabledRecord?.value === 'true';

	let isValid = false;

	if (isUiLockEnabled) {
		const hashRecord = await db.prepare("SELECT value FROM kv_settings WHERE key = 'ui_lock_hash'").first<{ value: string }>();
		const inputHash = await calculateHash(password);
		isValid = (inputHash === hashRecord?.value);

		// REMOVED: Break-glass fallback removed for security
		// Master API key should never be used as login password
		// If UI lock password is lost, admin must rotate via database directly
		// or use a separately configured EMERGENCY_UNLOCK_KEY (if set)
		const emergencyKey = c.env.EMERGENCY_UNLOCK_KEY as string | undefined;
		if (!isValid && emergencyKey && password === emergencyKey) {
			// Log emergency access for audit trail
			console.warn(`Emergency unlock used at ${new Date().toISOString()} from IP ${clientIp}`);
			isValid = true;
		}
	} else {
		isValid = (password === c.env.API_SECRET_KEY);
	}

	// Track failed attempts in D1
	if (!isValid) {
		if (attempt) {
			await db.prepare(
				`UPDATE login_attempts SET attempt_count = attempt_count + 1, last_attempt_at = ?
				WHERE ip_address = ?`
			).bind(now, clientIp).run();
		} else {
			await db.prepare(
				`INSERT INTO login_attempts (ip_address, first_attempt_at, last_attempt_at)
				VALUES (?, ?, ?)`
			).bind(clientIp, now, now).run();
		}
		return c.json({ error: "Invalid credentials" }, 401);
	}

	// Clear login attempts on successful login
	await db.prepare(
		`DELETE FROM login_attempts WHERE ip_address = ?`
	).bind(clientIp).run();

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
      aud: c.env.JWT_AUDIENCE as string | undefined,
      iss: c.env.JWT_ISSUER as string | undefined,
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
      aud: c.env.JWT_AUDIENCE as string | undefined,
      iss: c.env.JWT_ISSUER as string | undefined,
      exp: Math.floor(Date.now() / 1000) + (15 * 60)
  }, c.env.API_SECRET_KEY);

  c.header('Set-Cookie', `refresh_token=${newRawRefreshToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${7*24*60*60}`);

  return c.json({ access_token: jwt });
});

// Logout endpoint - revoke all tokens for session
authApi.post("/logout", dashboardAuthMiddleware, async (c) => {
  const payload = c.get('jwtPayload');
  if (!payload) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const db = c.env.DB;

  // Revoke all refresh tokens for this session
  await db.prepare(
    `UPDATE refresh_tokens
    SET status = 'revoked', updated_at = strftime('%s', 'now')
    WHERE session_id = ?`
  ).bind(payload.session_id).run();

  // Clear the refresh token cookie
  c.header('Set-Cookie', 'refresh_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');

  return c.json({ success: true, message: "Logged out successfully" });
});

export { authApi };
