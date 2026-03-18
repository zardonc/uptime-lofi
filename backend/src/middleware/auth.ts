import { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";

// Crypto helper using Web Crypto API for HMAC-SHA256
async function verifySignature(psk: string, timestamp: number, rawBody: string, signatureHex: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(psk);
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

  // Use timing-safe comparison logic if possible or standard text equality at edge.
  // Standard equality used here; minimal footprint.
  return signatureHex === expectedHex;
}

export const authMiddleware = async (c: Context, next: Next) => {
  const psk = c.env.API_SECRET_KEY as string | undefined;
  if (!psk) {
    throw new HTTPException(500, { message: "API_SECRET_KEY is not configured on the edge" });
  }

  const authHeader = c.req.header("Authorization");
  const timestampStr = c.req.header("X-Timestamp");

  if (!authHeader || !authHeader.startsWith("Bearer ") || !timestampStr) {
    throw new HTTPException(401, { message: "Missing Authentication Headers (Authorization or X-Timestamp)" });
  }

  const signature = authHeader.replace("Bearer ", "");
  const timestamp = parseInt(timestampStr, 10);
  const now = Math.floor(Date.now() / 1000);

  // 3-minute sliding window validation (180 seconds)
  if (Math.abs(now - timestamp) > 180) {
    throw new HTTPException(401, { message: "Request expired or clock severely skewed" });
  }

  // Clone request to safely read raw bytes without consuming Hono's stream down the line
  let rawBody = "";
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    rawBody = await c.req.raw.clone().text();
  }

  const isValid = await verifySignature(psk, timestamp, rawBody, signature);
  if (!isValid) {
    throw new HTTPException(401, { message: "Invalid HMAC Signature" });
  }

  await next();
};
