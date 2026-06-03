import { Hono } from "hono";
import type { Bindings } from "./api";
import {
  getStatisticsLeaderboards,
  getStatisticsSummary,
  getStatisticsTrends,
  normalizeStatisticsRange,
} from "../services/statisticsRollup";

const statisticsApi = new Hono<{ Bindings: Bindings }>();

statisticsApi.get("/summary", async (c) => {
  const range = normalizeStatisticsRange(c.req.query("range"));
  const result = await getStatisticsSummary(c.env, range);
  return c.json({ data: result.data, meta: { cache: result.cache } });
});

statisticsApi.get("/leaderboards", async (c) => {
  const range = normalizeStatisticsRange(c.req.query("range"));
  const result = await getStatisticsLeaderboards(c.env, range);
  return c.json({ data: result.data, meta: { cache: result.cache } });
});

statisticsApi.get("/trends", async (c) => {
  const range = normalizeStatisticsRange(c.req.query("range"));
  const result = await getStatisticsTrends(c.env, range);
  return c.json({ data: result.data, meta: { cache: result.cache } });
});

export { statisticsApi };
