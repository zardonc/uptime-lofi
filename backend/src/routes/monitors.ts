import { Hono } from "hono";
import type { Bindings } from "./api";
import {
  createMonitorSchema,
  structuredError,
  updateMonitorSchema,
  type BackendSource,
} from "../schemas/v2";
import {
  archiveMonitor,
  createMonitor,
  getMonitor,
  listMonitors,
  MonitorValidationError,
  setMonitorPaused,
  updateMonitor,
} from "../services/monitorRepository";

const monitorsApi = new Hono<{ Bindings: Bindings }>();

const MONITOR_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

monitorsApi.get("/", async (c) => {
  return c.json({ data: await listMonitors(c.env.DB, backendSource(c.req.header("x-uptime-lofi-backend-id"))) });
});

monitorsApi.get("/:id", async (c) => {
  const id = c.req.param("id") ?? "";
  if (!validMonitorId(id)) return c.json(structuredError("invalid_monitor_id", "Invalid monitor id"), 400);

  const monitor = await getMonitor(c.env.DB, id, backendSource(c.req.header("x-uptime-lofi-backend-id")));
  return monitor ? c.json({ data: monitor }) : c.json(structuredError("monitor_not_found", "Monitor not found"), 404);
});

monitorsApi.post("/", async (c) => {
  const parsed = createMonitorSchema.safeParse(await readJson(c.req.raw));
  if (!parsed.success) return c.json(structuredError("invalid_monitor", "Invalid monitor payload"), 400);

  try {
    const monitor = await createMonitor(c.env.DB, parsed.data, backendSource(c.req.header("x-uptime-lofi-backend-id")));
    return c.json({ data: monitor });
  } catch (error) {
    if (error instanceof MonitorValidationError) {
      return c.json(structuredError("invalid_monitor_config", error.message), 400);
    }
    throw error;
  }
});

monitorsApi.put("/:id", async (c) => {
  const id = c.req.param("id") ?? "";
  if (!validMonitorId(id)) return c.json(structuredError("invalid_monitor_id", "Invalid monitor id"), 400);

  const parsed = updateMonitorSchema.safeParse(await readJson(c.req.raw));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return c.json(structuredError("invalid_monitor_update", "Invalid monitor update"), 400);
  }

  try {
    const monitor = await updateMonitor(c.env.DB, id, parsed.data, backendSource(c.req.header("x-uptime-lofi-backend-id")));
    return monitor ? c.json({ data: monitor }) : c.json(structuredError("monitor_not_found", "Monitor not found"), 404);
  } catch (error) {
    if (error instanceof MonitorValidationError) {
      return c.json(structuredError("invalid_monitor_config", error.message), 400);
    }
    throw error;
  }
});

monitorsApi.post("/:id/pause", async (c) => {
  const id = c.req.param("id") ?? "";
  if (!validMonitorId(id)) return c.json(structuredError("invalid_monitor_id", "Invalid monitor id"), 400);

  const monitor = await setMonitorPaused(c.env.DB, id, true, backendSource(c.req.header("x-uptime-lofi-backend-id")));
  return monitor ? c.json({ data: monitor }) : c.json(structuredError("monitor_not_found", "Monitor not found"), 404);
});

monitorsApi.post("/:id/resume", async (c) => {
  const id = c.req.param("id") ?? "";
  if (!validMonitorId(id)) return c.json(structuredError("invalid_monitor_id", "Invalid monitor id"), 400);

  const monitor = await setMonitorPaused(c.env.DB, id, false, backendSource(c.req.header("x-uptime-lofi-backend-id")));
  return monitor ? c.json({ data: monitor }) : c.json(structuredError("monitor_not_found", "Monitor not found"), 404);
});

monitorsApi.delete("/:id", async (c) => {
  const id = c.req.param("id") ?? "";
  if (!validMonitorId(id)) return c.json(structuredError("invalid_monitor_id", "Invalid monitor id"), 400);

  const monitor = await archiveMonitor(c.env.DB, id, backendSource(c.req.header("x-uptime-lofi-backend-id")));
  return monitor ? c.json({ data: monitor }) : c.json(structuredError("monitor_not_found", "Monitor not found"), 404);
});

function validMonitorId(id: string) {
  return MONITOR_ID_PATTERN.test(id);
}

async function readJson(request: Request) {
  return request.json().catch(() => null);
}

function backendSource(backendId?: string): BackendSource {
  return {
    backend_id: backendId || "default",
    backend_label: "Default backend",
    backend_type: "cloudflare_worker",
  };
}

export { monitorsApi };
