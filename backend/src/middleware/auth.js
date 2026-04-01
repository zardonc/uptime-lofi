import { HTTPException } from "hono/http-exception";
// Crypto helper using Web Crypto API for HMAC-SHA256
async function deriveExpectedPsk(masterSecret, nodeId, salt) {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(masterSecret);
    const msgData = encoder.encode(`${nodeId}:${salt}`);
    const cryptoKey = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
    const sigArray = Array.from(new Uint8Array(sigBuffer));
    return sigArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
async function verifySignature(pskHex, timestamp, rawBody, signatureHex) {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(pskHex);
    const msgData = encoder.encode(`${timestamp}.${rawBody}`);
    const cryptoKey = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
    const sigArray = Array.from(new Uint8Array(sigBuffer));
    const expectedHex = sigArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return signatureHex === expectedHex;
}
export const probeAuthMiddleware = async (c, next) => {
    const masterSecret = c.env.API_SECRET_KEY;
    if (!masterSecret) {
        throw new HTTPException(500, { message: "API_SECRET_KEY is not configured on the edge" });
    }
    const authHeader = c.req.header("Authorization");
    const timestampStr = c.req.header("X-Timestamp");
    const nodeId = c.req.header("X-Node-Id");
    if (!authHeader || !authHeader.startsWith("Bearer ") || !timestampStr || !nodeId) {
        throw new HTTPException(401, { message: "Missing Authentication Headers (Authorization, X-Timestamp, or X-Node-Id)" });
    }
    const timestamp = parseInt(timestampStr, 10);
    const now = Math.floor(Date.now() / 1000);
    // 3-minute sliding window validation (180 seconds)
    if (Math.abs(now - timestamp) > 180) {
        throw new HTTPException(401, { message: "Request expired or clock severely skewed" });
    }
    // 1. Database Lookup for Salt
    const db = c.env.DB;
    const nodeRecord = await db.prepare("SELECT salt FROM nodes WHERE id = ?").bind(nodeId).first();
    if (!nodeRecord || !nodeRecord.salt) {
        // If salt is missing, the probe is not natively initialized to authenticate
        throw new HTTPException(401, { message: "Node auth mismatch or missing salt" });
    }
    const expectedPsk = await deriveExpectedPsk(masterSecret, nodeId, nodeRecord.salt);
    const signature = authHeader.replace("Bearer ", "");
    // Clone request to safely read raw bytes without consuming Hono's stream down the line
    let rawBody = "";
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
        rawBody = await c.req.raw.clone().text();
    }
    const isValid = await verifySignature(expectedPsk, timestamp, rawBody, signature);
    if (!isValid) {
        throw new HTTPException(401, { message: "Invalid HMAC Signature" });
    }
    await next();
};
