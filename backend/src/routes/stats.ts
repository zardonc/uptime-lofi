import { Hono } from "hono";
import { Bindings } from "./api";

const statsApi = new Hono<{ Bindings: Bindings }>();

statsApi.get("/overview", async (c) => {
  const db = c.env.DB;

  // Retrieve basic statistics across DB
  // For average ping, we constrain it to the last 24 hours to be relevant.
  const since = Math.floor(Date.now() / 1000) - 24 * 3600;

  const batchResults = await db.batch([
    db.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online FROM nodes`),
    db.prepare(`SELECT AVG(ping_ms) as avgPing FROM raw_metrics WHERE timestamp > ?`).bind(since),
    db.prepare(`SELECT AVG(uptime_ratio) as avgUptime FROM daily_stats`)
  ]);

  const nodesResult = batchResults[0].results[0] as any;
  const pingResult = batchResults[1].results[0] as any;
  const uptimeResult = batchResults[2].results[0] as any;

  return c.json({
    data: {
      totalNodes: nodesResult?.total || 0,
      onlineNodes: nodesResult?.online || 0,
      avgUptimeRatio: uptimeResult?.avgUptime || 100, // Default to 100% if no daily stats exist yet
      avgPing: pingResult?.avgPing ? Math.round(pingResult.avgPing) : 0
    }
  });
});

export { statsApi };
