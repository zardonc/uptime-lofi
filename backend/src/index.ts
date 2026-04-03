import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { api, Bindings } from './routes/api'
import { securityHeadersMiddleware } from './middleware/securityHeaders'

// Payload size enforcement
const MAX_BODY_SIZE = 1024 * 1024 // 1 MB

const app = new Hono<{ Bindings: Bindings }>()

// 1) Global security headers middleware (applied before CORS)
app.use('*', securityHeadersMiddleware)

// 2) CORS using Hono's built-in middleware
app.use('*', cors({
  origin: (origin) => {
    // Development: allow localhost
    if (origin?.startsWith('http://localhost') || origin?.startsWith('https://localhost')) {
      return origin
    }
    // Production: explicit allowlist from CORS_ORIGINS binding
    const corsOrigins = (globalThis as any)?.CORS_ORIGINS
    if (typeof corsOrigins === 'string') {
      const allowed = corsOrigins.split(',').map((s: string) => s.trim()).filter(Boolean)
      if (allowed.includes(origin)) return origin
    } else if (Array.isArray(corsOrigins) && corsOrigins.includes(origin)) {
      return origin
    }
    // No CORS for unauthorized origins
    return undefined
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Node-Id', 'X-Timestamp', 'X-Signature'],
  credentials: true,
  maxAge: 86400,
}))

// Add Vary: Origin header for proper CDN caching
app.use('*', async (c, next) => {
  await next()
  c.header('Vary', 'Origin', { append: true })
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
