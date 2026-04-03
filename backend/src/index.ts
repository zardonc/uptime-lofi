import { Hono } from 'hono'
// Removed external cors middleware to ensure compatibility in this environment
import { HTTPException } from 'hono/http-exception'
import { api, Bindings } from './routes/api'
import { securityHeadersMiddleware } from './middleware/securityHeaders'

// Payload size enforcement
const MAX_BODY_SIZE = 1024 * 1024 // 1 MB

const app = new Hono<{ Bindings: Bindings }>()

// 1) Global security headers middleware (applied before CORS)
app.use('*', securityHeadersMiddleware)

// 2) Minimal CORS middleware (origin function with explicit allowed origins)
// Build a list of allowed origins from environment-bindings if provided.
let allowedCorsOrigins: string[] = []
try {
  // Try to read a global binding that might be injected at runtime
  // This expects a global variable like globalThis.CORS_ORIGINS or window.CORS_ORIGINS
  const globalAny: any = (globalThis as any)
  const raw = globalAny?.CORS_ORIGINS
  if (typeof raw === 'string') {
    allowedCorsOrigins = raw.split(',').map((s: string) => s.trim()).filter(Boolean)
  } else if (Array.isArray(raw)) {
    allowedCorsOrigins = raw as string[]
  }
} catch {
  // ignore if not provided
}

const originFn = (origin: string | undefined): string | boolean | undefined => {
  if (!origin) return origin
  // Allow localhost for development
  if (origin.startsWith('http://localhost') || origin.startsWith('https://localhost')) {
    return origin
  }
  // Allow production origins configured via CORS_ORIGINS binding (comma-separated)
  if (allowedCorsOrigins.length > 0 && allowedCorsOrigins.includes(origin)) {
    return origin
  }
  // If not allowed, do not set Access-Control-Allow-Origin
  return undefined
}

// Lightweight CORS handling to satisfy environments where the 'hono/cors' plugin
// may not be available or type-check correctly. This preserves the essential
// behavior of allowing credentials from permitted origins.
app.use('*', async (c, next) => {
  const requestOrigin = ((c.req as any).headers?.get?.('Origin') || '');
  // Determine if origin is allowed (actual origin function logic can validate later)
  const allowedOrigin = typeof originFn === 'function' ? originFn(requestOrigin) : requestOrigin;
  if (typeof allowedOrigin === 'string') {
    c.header('Access-Control-Allow-Origin', allowedOrigin);
    c.header('Access-Control-Allow-Credentials', 'true');
  }
  if ((c.req as any).method?.toUpperCase?.() === 'OPTIONS') {
    c.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return c.json({ ok: true }, 200);
  }
  return next();
})

// Global middleware: enforce max payload size via Content-Length header when possible
app.use('*', async (c, next) => {
  // Access headers without tying to strict typings of Hono Request
  const contentLength = (c.req as any).headers?.get?.('content-length') ?? (c.req as any).header?.('content-length')
  if (contentLength) {
    const len = Number(contentLength)
    if (!Number.isNaN(len) && len > MAX_BODY_SIZE) {
      return c.json({ error: 'Payload Too Large' }, 413)
    }
  }
  return next()
})

// Global Error Handler returning standardized JSON wrapper
app.onError((err, c) => {
  console.error("Global Catch:", err.message);
  if (err instanceof HTTPException) {
    // If we explicitly threw this, return its status and payload
    return c.json({ error: err.message }, err.status);
  }
  return c.json({ error: "Internal Server Error" }, 500);
});

// Open Public Endpoint - Base status
app.get('/', (c) => {
  return c.json({ status: 'ok', service: 'uptime-lofi-gateway', timestamp: Math.floor(Date.now() / 1000) })
});

// Health check endpoint - verifies database connectivity
app.get('/health', async (c) => {
  const checks: Record<string, { status: string; latency_ms?: number; error?: string }> = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
  };

  // Check database connectivity
  try {
    const start = Date.now();
    await c.env.DB.prepare('SELECT 1').first();
    checks.database = {
      status: 'healthy',
      latency_ms: Date.now() - start
    };
  } catch (error) {
    checks.database = {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
    checks.status = 'unhealthy';
  }

  const statusCode = checks.status === 'healthy' ? 200 : 503;
  return c.json(checks, statusCode);
});

// Readiness endpoint (for k8s/deployment)
app.get('/ready', async (c) => {
  try {
    await c.env.DB.prepare('SELECT 1').first();
    return c.json({ ready: true }, 200);
  } catch {
    return c.json({ ready: false }, 503);
  }
});

// Mount the protected modular routes
app.route('/api', api);

export default app
