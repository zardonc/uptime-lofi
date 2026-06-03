import { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";

// Crypto helper using Web Crypto API for HMAC-SHA256
async function deriveExpectedPsk(masterSecret: string, monitorId: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(masterSecret);
  const msgData = encoder.encode(`${monitorId}:${salt}`);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  const sigArray = Array.from(new Uint8Array(sigBuffer));
  return sigArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifySignature(pskHex: string, timestamp: number, rawBody: string, signatureHex: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(pskHex);
  const msgData = encoder.encode(`${timestamp}.${rawBody}`);
  
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  const sigArray = Array.from(new Uint8Array(sigBuffer));
  const expectedHex = sigArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return signatureHex === expectedHex;
}

export const probeAuthMiddleware = async (c: Context, next: Next) => {
  const masterSecret = c.env.API_SECRET_KEY as string | undefined;
  if (!masterSecret) {
    throw new HTTPException(500, { message: "API_SECRET_KEY is not configured on the edge" });
  }

	const authHeader = c.req.header("Authorization");
	const timestampStr = c.req.header("X-Timestamp");
	const monitorId = c.req.header("X-Monitor-Id");

	if (!authHeader || !authHeader.startsWith("Bearer ") || !timestampStr || !monitorId) {
		throw new HTTPException(401, { message: "Missing Authentication Headers (Authorization, X-Timestamp, or X-Monitor-Id)" });
	}

	// SECURITY: Validate monitor ID format before using it in database queries.
	if (!/^[a-zA-Z0-9_-]+$/.test(monitorId)) {
		throw new HTTPException(400, { message: "Invalid monitor ID format" });
	}

  const timestamp = parseInt(timestampStr, 10);
  const now = Math.floor(Date.now() / 1000);

  // 3-minute sliding window validation (180 seconds)
  if (Math.abs(now - timestamp) > 180) {
    throw new HTTPException(401, { message: "Request expired or clock severely skewed" });
  }

  // 1. Database Lookup for Salt
  const db = c.env.DB as D1Database;
  const monitorRecord = await db.prepare(
    "SELECT salt FROM monitors WHERE id = ? AND archived_at IS NULL AND paused = 0 AND type = 'agent'",
  ).bind(monitorId).first<{ salt: string | null }>();
  
  if (!monitorRecord || !monitorRecord.salt) {
    // If salt is missing, the probe is not natively initialized to authenticate
    throw new HTTPException(401, { message: "Monitor auth mismatch or missing salt" });
  }

  const expectedPsk = await deriveExpectedPsk(masterSecret, monitorId, monitorRecord.salt);
  const signature = authHeader.replace("Bearer ", "");

  // Clone request to safely read raw bytes without consuming Hono's stream down the line
  let rawBody = "";
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    rawBody = await c.req.raw.clone().text();
  }

	const isValid = await verifySignature(expectedPsk, timestamp, rawBody, signature);
	if (!isValid) {
		// SECURITY: Log failed authentication attempts for audit trail
		const clientIp = c.req.header("CF-Connecting-IP") || "unknown";
		console.warn(`Auth failed for monitor ${monitorId} from IP ${clientIp}`);
		throw new HTTPException(401, { message: "Invalid HMAC Signature" });
	}

  await next();
};
