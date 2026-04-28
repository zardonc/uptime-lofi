import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { probeAuthMiddleware } from './middleware/auth'
import { pushApi } from './routes/push'

// Minimal Probe Worker — handles ONLY /api/push traffic
// Separated from dashboard Worker to reduce cold-start surface and isolate probe traffic

interface ProbeBindings {
  DB: D1Database;
  API_SECRET_KEY: string;
}

const app = new Hono<{ Bindings: ProbeBindings }>()

// Global Error Handler
app.onError((err, c) => {
  console.error("Probe Worker Error:", err.message);
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  return c.json({ error: "Internal Server Error" }, 500);
});

// Health check — verifies database connectivity
app.get('/health', async (c) => {
  try {
    const start = Date.now();
    await c.env.DB.prepare('SELECT 1').first();
    return c.json({
      status: 'healthy',
      service: 'uptime-lofi-probe',
      database_latency_ms: Date.now() - start,
      timestamp: Math.floor(Date.now() / 1000)
    });
  } catch (error) {
    return c.json({
      status: 'unhealthy',
      service: 'uptime-lofi-probe',
      database_error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Math.floor(Date.now() / 1000)
    }, 503);
  }
});

// Root status
app.get('/', (c) => {
  return c.json({ status: 'ok', service: 'uptime-lofi-probe', timestamp: Math.floor(Date.now() / 1000) });
});

// Protected probe push endpoint — HMAC auth required
const probe = new Hono<{ Bindings: ProbeBindings }>();
probe.use('*', probeAuthMiddleware);
probe.route('/push', pushApi);
app.route('/api', probe);

export default app
