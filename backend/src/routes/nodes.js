import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
const nodesApi = new Hono();
nodesApi.get("/", async (c) => {
    const db = c.env.DB;
    const { results } = await db.prepare(`SELECT * FROM nodes ORDER BY status DESC, last_heartbeat DESC`).all();
    // Try parsing config_json for each node if it exists
    const nodes = results.map(node => ({
        ...node,
        config: node.config_json ? JSON.parse(node.config_json) : null
    }));
    return c.json({ data: nodes });
});
nodesApi.get("/:id/metrics", zValidator("query", z.object({
    hours: z.string().optional().default("24").transform((v) => parseInt(v, 10))
})), async (c) => {
    const db = c.env.DB;
    const id = c.req.param("id");
    const { hours } = c.req.valid("query");
    const since = Math.floor(Date.now() / 1000) - hours * 3600;
    const { results } = await db.prepare(`SELECT * FROM raw_metrics WHERE node_id = ? AND timestamp > ? ORDER BY timestamp ASC`).bind(id, since).all();
    // Map containers_json
    const metrics = results.map(m => ({
        ...m,
        containers: m.containers_json ? JSON.parse(m.containers_json) : null
    }));
    return c.json({ data: metrics });
});
export { nodesApi };
