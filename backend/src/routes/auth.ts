import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sign } from "hono/jwt";
import { getCookie } from "hono/cookie";
import { strictRateLimit } from "../middleware/rateLimiter";
import { dashboardAuthMiddleware } from "../middleware/dashboardAuth";
import { hashPassword, verifyPassword, generateSalt, hashToken, hashIpAddress } from "../utils/crypto";

// Token TTL constants
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 60 minutes
const REFRESH_TOKEN_TTL_SECONDS = 15 * 24 * 60 * 60; // 15 days

// Opportunistic cleanup of expired refresh tokens to prevent table bloat
async function cleanupExpiredTokens(db: D1Database) {
  await db.prepare("DELETE FROM refresh_tokens WHERE expires_at < strftime('%s', 'now')").run();
}

const authApi = new Hono<{ Bindings: { DB: D1Database; API_SECRET_KEY: string; EMERGENCY_UNLOCK_KEY?: string; JWT_AUDIENCE?: string; JWT_ISSUER?: string; SESSION_BLACKLIST: KVNamespace } }>();

// Apply strict rate limiting to login endpoint
authApi.use("/login", strictRateLimit);

authApi.post("/setup", zValidator("json", z.object({ admin_key: z.string(), new_ui_password: z.string() })), async (c) => {
  const { admin_key, new_ui_password } = c.req.valid("json");
  if (admin_key !== c.env.API_SECRET_KEY) {
    return c.json({ error: "Unauthorized", retry_after: 60 }, 401);
  }

  const salt = generateSalt(16);
  const hash = await hashPassword(new_ui_password, salt);
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT OR REPLACE INTO kv_settings (key, value) VALUES ('ui_lock_hash', ?)").bind(hash),
    c.env.DB.prepare("INSERT OR REPLACE INTO kv_settings (key, value) VALUES ('ui_lock_salt', ?)").bind(salt),
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
    return c.json({ error: "Unauthorized", retry_after: 60 }, 401);
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
	const ipHash = await hashIpAddress(clientIp, c.env.API_SECRET_KEY);
	const now = Math.floor(Date.now() / 1000);
	const windowStart = now - 900; // 15 minutes

	// Opportunistic cleanup of expired refresh tokens
	await cleanupExpiredTokens(db);

	// Check and track failed login attempts using D1 (cross-instance)
	const attempt = await db.prepare(
		`SELECT attempt_count, first_attempt_at FROM login_attempts
		WHERE ip_hash = ? AND last_attempt_at > ?`
	).bind(ipHash, windowStart).first<{ attempt_count: number; first_attempt_at: number }>();

	if (attempt && attempt.attempt_count >= 5) {
		const resetIn = attempt.first_attempt_at + 900 - now;
		return c.json({
			error: "Too many failed attempts",
			retry_after: resetIn
		}, 429);
	}

	// Merged kv_settings query: fetch all UI lock settings in a single round-trip
	const settingsResult = await db.prepare(
		"SELECT key, value FROM kv_settings WHERE key IN ('ui_lock_enabled', 'ui_lock_hash', 'ui_lock_salt')"
	).all<{ key: string; value: string }>();

	const settings: Record<string, string> = {};
	for (const row of settingsResult.results || []) {
		settings[row.key] = row.value;
	}

	const isUiLockEnabled = settings['ui_lock_enabled'] === 'true';
	const uiLockHash = settings['ui_lock_hash'];
	const uiLockSalt = settings['ui_lock_salt'];

	let isValid = false;

	if (isUiLockEnabled) {
		// Migration guard: existing SHA-256 hashes have no salt stored
		if (!uiLockSalt) {
			return c.json({
				error: "Password hash needs to be re-setup. Please call /setup to reconfigure."
			}, 400);
		}

		isValid = await verifyPassword(password, uiLockHash || '', uiLockSalt);

		// REMOVED: Break-glass fallback removed for security
		// Master API key should never be used as login password
		// If UI lock password is lost, admin must rotate via database directly
		// or use a separately configured EMERGENCY_UNLOCK_KEY (if set)
		const emergencyKey = c.env.EMERGENCY_UNLOCK_KEY as string | undefined;
		if (!isValid && emergencyKey && password === emergencyKey) {
			// Revoke all active sessions (security measure — force re-auth after emergency access)
			await db.prepare(
				"UPDATE refresh_tokens SET status = 'revoked' WHERE status = 'active'"
			).run();

			// Write audit log entry
			await db.prepare(
				"INSERT INTO audit_log (action, ip_hash, details) VALUES ('emergency_unlock', ?, ?)"
			).bind(ipHash, JSON.stringify({ ip: clientIp, timestamp: new Date().toISOString() })).run();

			console.warn(`Emergency unlock used at ${new Date().toISOString()} from IP ${clientIp}. All sessions revoked.`);
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
				WHERE ip_hash = ?`
			).bind(now, ipHash).run();
		} else {
			await db.prepare(
				`INSERT INTO login_attempts (ip_address, ip_hash, first_attempt_at, last_attempt_at)
				VALUES (?, ?, ?, ?)`
			).bind(clientIp, ipHash, now, now).run();
		}
		return c.json({ error: "Invalid credentials" }, 401);
	}

	// Batch all write operations on successful login: cleanup + delete attempts + audit log + refresh token
	const sessionId = crypto.randomUUID();
	const rawRefreshToken = crypto.randomUUID() + crypto.randomUUID();
	const refreshTokenHash = await hashToken(rawRefreshToken);
	const expiresAt = Math.floor(Date.now() / 1000) + REFRESH_TOKEN_TTL_SECONDS;

	await db.batch([
		db.prepare("DELETE FROM login_attempts WHERE ip_hash = ?").bind(ipHash),
		db.prepare("INSERT INTO audit_log (action, ip_hash, details) VALUES ('login_success', ?, ?)").bind(ipHash, JSON.stringify({ session_id: sessionId })),
		db.prepare("INSERT INTO refresh_tokens (token_hash, session_id, status, expires_at) VALUES (?, ?, 'active', ?)").bind(refreshTokenHash, sessionId, expiresAt),
	]);
  
  const jwt = await sign({
      session_id: sessionId,
      role: 'admin',
      aud: c.env.JWT_AUDIENCE as string | undefined,
      iss: c.env.JWT_ISSUER as string | undefined,
      exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS
  }, c.env.API_SECRET_KEY);

  c.header('Set-Cookie', `refresh_token=${rawRefreshToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${REFRESH_TOKEN_TTL_SECONDS}`);

  return c.json({ access_token: jwt });
});

authApi.post("/refresh", async (c) => {
  const rawRefreshToken = getCookie(c, "refresh_token");
  if (!rawRefreshToken) return c.json({ error: "Missing refresh token" }, 401);

  const hash = await hashToken(rawRefreshToken);
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
  const newHash = await hashToken(newRawRefreshToken);
  const newExpiresAt = Math.floor(Date.now() / 1000) + REFRESH_TOKEN_TTL_SECONDS;

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
      exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS
  }, c.env.API_SECRET_KEY);

  c.header('Set-Cookie', `refresh_token=${newRawRefreshToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${REFRESH_TOKEN_TTL_SECONDS}`);

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
    SET status = 'revoked'
    WHERE session_id = ?`
  ).bind(payload.session_id).run();

  // KV blacklist for instant revocation across all edge instances
  await c.env.SESSION_BLACKLIST.put(
    `session:${payload.session_id}`,
    'revoked',
    { expirationTtl: 3600 } // 1 hour TTL — matches JWT max remaining lifetime
  );

  // Clear the refresh token cookie
  c.header('Set-Cookie', 'refresh_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');

  return c.json({ success: true, message: "Logged out successfully" });
});

export { authApi };
