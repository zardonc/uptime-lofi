import { Hono } from "hono";
import { z } from "zod";
import { isHttpTargetAllowed, isTcpTargetAllowed } from "../agentless/checks";
import { createMonitor, getMonitor, listMonitors, setMonitorPaused } from "../services/monitorRepository";
import type { Bindings } from "./api";

const agentlessApi = new Hono<{ Bindings: Bindings }>();

const MONITOR_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

const httpPayloadSchema = z.object({
  name: z.string().trim().min(1).max(80),
  url: z.string().url(),
  interval: z.number().int().min(30).max(86400),
  timeout: z.number().int().min(1).max(300),
  expected_status: z.number().int().min(100).max(599),
}).strict();

const tcpPayloadSchema = z.object({
  name: z.string().trim().min(1).max(80),
  host: z.string().trim().min(1).max(253),
  port: z.number().int().min(1).max(65535),
  timeout: z.number().int().min(1).max(300),
  interval: z.number().int().min(30).max(86400),
}).strict();

agentlessApi.get("/", async (c) => {
  const monitors = await listMonitors(c.env.DB);
  return c.json({ data: monitors.filter((monitor) => monitor.type === "http" || monitor.type === "tcp").map(toAgentlessCheck) });
});

agentlessApi.post("/http", async (c) => {
  const parsed = httpPayloadSchema.safeParse(await readJson(c.req.raw));
  if (!parsed.success) return c.json({ error: "Invalid agentless HTTP payload" }, 400);
  const allowed = isHttpTargetAllowed(parsed.data.url);
  if (!allowed.allowed) return c.json({ error: allowed.reason ?? "HTTP target is not allowed" }, 400);
  if (await activeNameExists(c.env.DB, parsed.data.name)) return c.json({ error: "A monitor with this name already exists" }, 409);

  const monitor = await createMonitor(c.env.DB, {
    name: parsed.data.name,
    type: "http",
    interval_sec: parsed.data.interval,
    timeout_sec: parsed.data.timeout,
    config: {
      url: parsed.data.url,
      expected_status: parsed.data.expected_status,
    },
    public_visible: true,
  });
  return c.json({ data: toAgentlessCheck(monitor) });
});

agentlessApi.post("/tcp", async (c) => {
  const parsed = tcpPayloadSchema.safeParse(await readJson(c.req.raw));
  if (!parsed.success) return c.json({ error: "Invalid agentless TCP payload" }, 400);
  const allowed = isTcpTargetAllowed(parsed.data.host, parsed.data.port);
  if (!allowed.allowed) return c.json({ error: allowed.reason ?? "TCP target is not allowed" }, 400);
  if (await activeNameExists(c.env.DB, parsed.data.name)) return c.json({ error: "A monitor with this name already exists" }, 409);

  const monitor = await createMonitor(c.env.DB, {
    name: parsed.data.name,
    type: "tcp",
    interval_sec: parsed.data.interval,
    timeout_sec: parsed.data.timeout,
    config: {
      host: parsed.data.host,
      port: parsed.data.port,
    },
    public_visible: true,
  });
  return c.json({ data: toAgentlessCheck(monitor) });
});

agentlessApi.post("/:id/pause", async (c) => {
  const id = c.req.param("id");
  if (!validMonitorId(id)) return c.json({ error: "Invalid monitor id" }, 400);
  const monitor = await setMonitorPaused(c.env.DB, id, true);
  return monitor && (monitor.type === "http" || monitor.type === "tcp")
    ? c.json({ data: toAgentlessCheck(monitor) })
    : c.json({ error: "Agentless check not found" }, 404);
});

agentlessApi.post("/:id/resume", async (c) => {
  const id = c.req.param("id");
  if (!validMonitorId(id)) return c.json({ error: "Invalid monitor id" }, 400);
  const monitor = await setMonitorPaused(c.env.DB, id, false);
  return monitor && (monitor.type === "http" || monitor.type === "tcp")
    ? c.json({ data: toAgentlessCheck(monitor) })
    : c.json({ error: "Agentless check not found" }, 404);
});

agentlessApi.delete("/:id", async (c) => {
  const id = c.req.param("id");
  if (!validMonitorId(id)) return c.json({ error: "Invalid monitor id" }, 400);
  const current = await getMonitor(c.env.DB, id);
  if (!current || (current.type !== "http" && current.type !== "tcp")) {
    return c.json({ error: "Agentless check not found" }, 404);
  }
  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(
    "UPDATE monitors SET archived_at = ?, paused = 1, updated_at = ? WHERE id = ? AND archived_at IS NULL",
  ).bind(now, now, id).run();
  return c.json({ data: { id, status: "paused", archived_at: now, updated_at: now } });
});

async function readJson(request: Request) {
  return request.json().catch(() => null);
}

function validMonitorId(id: string) {
  return MONITOR_ID_PATTERN.test(id);
}

async function activeNameExists(db: D1Database, name: string) {
  const row = await db.prepare(
    "SELECT id FROM monitors WHERE archived_at IS NULL AND lower(name) = ? LIMIT 1",
  ).bind(name.trim().toLowerCase()).first<{ id: string }>();
  return Boolean(row);
}

function toAgentlessCheck(monitor: Awaited<ReturnType<typeof listMonitors>>[number]) {
  const latest = monitor.latest.checked_at == null ? null : {
    timestamp: monitor.latest.checked_at,
    is_up: monitor.status === "online" || monitor.status === "degraded",
    latency_ms: monitor.latest.latency_ms,
    error_text: monitor.latest.error_text,
  };
  return {
    id: monitor.id,
    name: monitor.name,
    type: monitor.type === "http" ? "http" : "tcp",
    status: monitor.status,
    target: monitor.target.label,
    interval_seconds: monitor.interval_sec,
    interval: monitor.interval_sec,
    timeout_seconds: monitor.timeout_sec,
    timeout: monitor.timeout_sec,
    expected_status: monitor.type === "http" ? 200 : undefined,
    latest_ping_ms: monitor.latest.latency_ms,
    latest_is_up: latest?.is_up ?? null,
    latest_error_text: monitor.latest.error_text,
    latest_timestamp: monitor.latest.checked_at,
    latest_result: latest,
    tcp_available: true,
    disabled_reason: null,
  };
}

export { agentlessApi };
