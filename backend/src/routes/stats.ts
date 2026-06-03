import { Hono } from "hono";
import { Bindings } from "./api";

const statsApi = new Hono<{ Bindings: Bindings }>();

statsApi.get("/overview", async (c) => {
  const db = c.env.DB;

  const since = Math.floor(Date.now() / 1000) - 24 * 3600;

  const batchResults = await db.batch([
    db.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN ml.status = 'online' AND m.paused = 0 THEN 1 ELSE 0 END) AS online
       FROM monitors m
       LEFT JOIN monitor_latest ml ON ml.monitor_id = m.id
       WHERE m.archived_at IS NULL`,
    ),
    db.prepare(`SELECT AVG(latency_ms) AS avgPing FROM check_results WHERE timestamp > ?`).bind(since),
    db.prepare(
      `SELECT
         CASE WHEN SUM(check_count) > 0
           THEN ((SUM(up_count) + SUM(warn_count)) * 100.0 / SUM(check_count))
           ELSE NULL
         END AS avgUptime
       FROM daily_summaries`,
    )
  ]);

  const monitorsResult = batchResults[0].results[0] as any;
  const pingResult = batchResults[1].results[0] as any;
  const uptimeResult = batchResults[2].results[0] as any;

  return c.json({
    data: {
      totalMonitors: monitorsResult?.total || 0,
      onlineMonitors: monitorsResult?.online || 0,
      avgUptimeRatio: uptimeResult?.avgUptime || 100, // Default to 100% if no daily stats exist yet
      avgPing: pingResult?.avgPing ? Math.round(pingResult.avgPing) : 0
    }
  });
});

export { statsApi };
