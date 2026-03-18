import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { api, Bindings } from './routes/api'

const app = new Hono<{ Bindings: Bindings }>()

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

// Mount the protected modular routes
app.route('/api', api);

export default app
