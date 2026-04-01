import { Context, Next } from "hono";

type RateStoreEntry = {
  timestamps: number[];
  windowMs: number;
  limit: number;
};

// Global stores per limiter
const strictStore = new Map<string, RateStoreEntry>();
const standardStore = new Map<string, RateStoreEntry>();
const permissiveStore = new Map<string, RateStoreEntry>();

// Cleanup runs lazily - no setInterval (not allowed in Cloudflare Workers global scope)
function cleanupExpiredEntries(store: Map<string, RateStoreEntry>) {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    const cutoff = now - entry.windowMs;
    entry.timestamps = entry.timestamps.filter(ts => ts > cutoff);
    if (entry.timestamps.length === 0) {
      store.delete(key);
    }
  }
}

function extractClientId(req: Request): string {
  // Prefer CF-Connecting-IP as per requirement
  const cfIp = req.headers.get("CF-Connecting-IP") || "";
  if (cfIp) return cfIp;
  // Fallbacks
  const xff = req.headers.get("X-Forwarded-For") || "";
  if (xff) return xff.split(",")[0].trim();
  return "unknown";
}

function getPathKey(req: Request): string {
  try {
    const u = new URL(req.url);
    return u.pathname;
  } catch {
    // Fallback if URL parsing fails
    return "";
  }
}

function createLimiter(store: Map<string, RateStoreEntry>, limit: number, windowMs: number) {
  return async (c: Context, next: Next) => {
    // Cleanup expired entries lazily (Cloudflare Workers doesn't allow global setInterval)
    cleanupExpiredEntries(store);
    
    // Access to request is via c.req; cast to any to avoid DOM lib type issues
    const clientId = extractClientId((c.req as any));
    const pathKey = getPathKey((c.req as any));
    const mapKey = `${clientId}:${pathKey}`;
    const now = Date.now();
    let entry = store.get(mapKey);
    if (!entry) {
      entry = { timestamps: [], windowMs, limit };
      store.set(mapKey, entry);
    }
    // Prune stale timestamps
    entry.timestamps = entry.timestamps.filter(ts => ts > now - entry.windowMs);
    if (entry.timestamps.length >= entry.limit) {
      // Calculate retry-after as time until oldest timestamp leaves the window
      const oldest = entry.timestamps[0];
      const retryAfterMs = entry.windowMs - (now - oldest);
      const retryAfterSec = Math.ceil(retryAfterMs / 1000);
      c.header("Retry-After", String(retryAfterSec));
      return c.json({ error: "Too Many Requests" }, 429);
    }
    // Record this request
    entry.timestamps.push(now);
    store.set(mapKey, entry);
    return next();
  };
}

// Public middlewares
export const strictRateLimit = createLimiter(strictStore, 5, 60_000);
export const standardRateLimit = createLimiter(standardStore, 60, 60_000);
export const permissiveRateLimit = createLimiter(permissiveStore, 300, 60_000);
