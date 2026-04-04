import { Context, Next } from "hono";
import { jwt } from "hono/jwt";
import { HTTPException } from "hono/http-exception";
import type { JwtPayload } from "../types/hono-payload";

export const dashboardAuthMiddleware = async (c: Context, next: Next) => {
	const secret = c.env.API_SECRET_KEY as string | undefined;
	if (!secret) {
		throw new HTTPException(500, { message: "API_SECRET_KEY is not configured on the edge" });
	}

	// Validate aud/iss as part of JWT validation
	const aud = c.env.JWT_AUDIENCE as string | undefined;
	const iss = c.env.JWT_ISSUER as string | undefined;

	const jwtMiddleware = jwt({
		secret,
		alg: "HS256",
		...(aud ? { audience: aud } : {}),
		...(iss ? { issuer: iss } : {}),
	});

	// Wrap next to perform post-validation checks and payload attachment
	const wrapped = async () => {
		// Attach JWT payload to context for downstream handlers
		let payload: JwtPayload | undefined;
		const authHeader = c.req.header("Authorization");
		if (authHeader && authHeader.startsWith("Bearer ")) {
			const token = authHeader.substring(7);
			try {
				const parts = token.split(".");
				if (parts.length >= 2) {
					const payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
					const json = decodeURIComponent(
						atob(payloadB64)
							.split("")
							.map((ch) => "%" + ("00" + ch.charCodeAt(0).toString(16)).slice(-2))
							.join("")
					);
					payload = JSON.parse(json) as JwtPayload;
				}
			} catch {
				payload = undefined;
			}
		}

		// Check KV blacklist first (instant revocation across all edge instances)
		if (payload?.session_id) {
			try {
				const blacklisted = await c.env.SESSION_BLACKLIST.get(`session:${payload.session_id}`);
				if (blacklisted === 'revoked') {
					throw new HTTPException(401, { message: "Session revoked" });
				}
			} catch (e) {
				if (e instanceof HTTPException) throw e;
				// KV read failure is non-fatal — fall through to D1 check
				console.warn("KV blacklist check failed, falling back to D1:", e);
			}
		}

		// If we have a session_id, ensure the session is still active in the DB
		if (payload?.session_id) {
			try {
				const db = c.env.DB;
				const row = await (db
					.prepare("SELECT status FROM refresh_tokens WHERE session_id = ?")
					.bind(payload.session_id)
					.first() as { status: string } | undefined);
				if (!row || row.status !== "active") {
					throw new HTTPException(401, { message: "Invalid or inactive session" });
				}
			} catch {
				throw new HTTPException(401, { message: "Invalid session" });
			}
		}

		// Expose payload on the context for downstream handlers using proper Hono context
		c.set("jwtPayload", payload);
		return next();
	};

	return jwtMiddleware(c, wrapped);
};
