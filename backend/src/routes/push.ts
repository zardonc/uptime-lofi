import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

const pushApi = new Hono<{ Bindings: { DB: D1Database } }>();

// Query limits
const MAX_BATCH_SIZE = 100

// Validation for a single metrics entry
const metricSchema = z.object({
  node_id: z.string().regex(/^[a-zA-Z0-9_-]+$/, { message: 'node_id must match ^[a-zA-Z0-9_-]+$' }),
  timestamp: z.number().int(),
  ping: z.number().max(60000, { message: 'ping must be <= 60000' }).optional(),
  cpu: z.number().min(0, { message: 'cpu must be >= 0' }).max(100, { message: 'cpu must be <= 100' }),
  mem: z.number().min(0, { message: 'mem must be >= 0' }).max(100, { message: 'mem must be <= 100' }),
  is_up: z.boolean(),
  containers_json: z.string().max(10000, { message: 'containers_json length must be <= 10000' }).optional(),
}).superRefine((data, ctx) => {
  // Timestamp must be within last 24 hours and not in the future
  const now = Math.floor(Date.now() / 1000)
  if (typeof data.timestamp !== 'number' || data.timestamp > now || data.timestamp < now - 24 * 60 * 60) {
    ctx.addIssue({ path: ['timestamp'], code: z.ZodIssueCode.custom, message: 'timestamp must be within last 24 hours and not in the future' })
  }
})

const batchPayloadSchema = z.array(metricSchema).max(MAX_BATCH_SIZE, { message: 'Batch size must be <= 100' })

pushApi.post(
  "/",
  zValidator("json", batchPayloadSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: "Malformed payload format" }, 400);
    }
  }),
  async (c) => {
    const payload = c.req.valid("json");
    if (payload.length === 0) {
      return c.json({ status: "ignored", reason: "Empty payload batch" });
    }

    const db = c.env.DB;

    // 1. Prepare raw_metrics table insertions
    const insertStmt = db.prepare(
      `INSERT INTO raw_metrics (node_id, timestamp, ping_ms, cpu_usage, mem_usage, is_up, containers_json) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    const batchStmts = payload.map((m) =>
      insertStmt.bind(
        m.node_id,
        m.timestamp,
        m.ping ?? null,
        m.cpu,
        m.mem,
        m.is_up ? 1 : 0,
        m.containers_json ?? null
      )
    );

    // 2. Identify the most chronological update per node to adjust the parent nodes table
    const latestMetrics = new Map<string, z.infer<typeof metricSchema>>();
    for (const m of payload) {
      const existing = latestMetrics.get(m.node_id);
      if (!existing || m.timestamp > existing.timestamp) {
        latestMetrics.set(m.node_id, m);
      }
    }

    const updateStmts = Array.from(latestMetrics.values()).map((m) => {
      const isUpStatus = m.is_up ? "online" : "offline";
      return db.prepare(
        `UPDATE nodes 
         SET status = ?, last_heartbeat = ?, config_json = json_set(COALESCE(config_json, '{}'), '$.agent.containers', ?) 
         WHERE id = ?`
      ).bind(isUpStatus, m.timestamp, m.containers_json ?? null, m.node_id);
    });

    try {
      // Execute 100+ writes safely in a single high-performance Edge roundtrip
      await db.batch([...batchStmts, ...updateStmts]);
    } catch (err: any) {
      console.error("D1 Transaction Batch Failed:", err.message);
      return c.json({ error: "Failed executing database batch" }, 500);
    }

    // Return OTA Zero-Cost Trigger schema
    return c.json({ 
      status: "success", 
      received: payload.length, 
      ota_trigger: false, 
      new_config: null 
    });
  }
);

export { pushApi };
