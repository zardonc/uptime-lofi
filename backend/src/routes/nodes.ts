import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { Bindings } from "./api";
import { dashboardAuthMiddleware } from "../middleware/dashboardAuth";

const nodesApi = new Hono<{ Bindings: Bindings }>();

 nodesApi.get("/", async (c) => {
  const db = c.env.DB;
  const { results } = await db.prepare(
    `SELECT * FROM nodes ORDER BY status DESC, last_heartbeat DESC`
  ).all();

  // Try parsing config_json for each node if it exists
  const nodes = results.map(node => ({
    ...node,
    config: node.config_json ? JSON.parse(node.config_json as string) : null
  }));

  return c.json({ data: nodes });
});

 // Input sanitization: validate id and hours
nodesApi.get(
  "/:id/metrics",
  zValidator("query", z.object({
    hours: z.string().optional().default("24").transform((v) => {
      const n = parseInt(v, 10);
      if (Number.isNaN(n)) throw new Error("Invalid hours");
      if (n < 1 || n > 168) throw new Error("Hours must be between 1 and 168");
      return n;
    })
  })),
  async (c) => {
    const db = c.env.DB;
    const id = c.req.param("id");
    // Validate node_id against allowed pattern to prevent injection
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return c.json({ error: "Invalid node id" }, 400);
    }
    const { hours } = c.req.valid("query");

  const since = Math.floor(Date.now() / 1000) - hours * 3600;

  // SECURITY: D1 prepared statements use parameterized queries (.bind())
  // This prevents SQL injection. Never use string concatenation in queries.
  const { results } = await db.prepare(
    `SELECT * FROM raw_metrics WHERE node_id = ? AND timestamp > ? ORDER BY timestamp ASC`
  ).bind(id, since).all();

    // Map containers_json
    const metrics = results.map(m => ({
      ...m,
      containers: m.containers_json ? JSON.parse(m.containers_json as string) : null
    }));

    return c.json({ data: metrics });
  }
);


// Node management endpoints (stubs for future implementation)

// Create node
nodesApi.post("/", dashboardAuthMiddleware, async (c) => {
  return c.json({
    error: "Not implemented",
    message: "Node creation will be implemented in a future phase"
  }, 501);
});

// Update node
nodesApi.put("/:id", dashboardAuthMiddleware, async (c) => {
  const id = c.req.param("id");
  return c.json({
    error: "Not implemented",
    message: "Node " + id + " update will be implemented in a future phase"
  }, 501);
});

// Delete node
nodesApi.delete("/:id", dashboardAuthMiddleware, async (c) => {
  const id = c.req.param("id");
  return c.json({
    error: "Not implemented",
    message: "Node " + id + " deletion will be implemented in a future phase"
  }, 501);
});

export { nodesApi };
