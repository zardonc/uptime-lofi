import { Hono } from "hono";
import type { Bindings } from "./api";
import { structuredError, type BackendSource } from "../schemas/v2";
import { buildPublicStatusResponse } from "../services/publicStatusService";

const publicStatusApi = new Hono<{ Bindings: Bindings }>();

publicStatusApi.get("/status", async (c) => {
  const response = await buildPublicStatusResponse(
    c.env.DB,
    backendSource(c.req.header("x-uptime-lofi-backend-id")),
    c.req.query("slug") ?? null,
  );

  return response
    ? c.json(response)
    : c.json(structuredError("public_status_unavailable", "Public Status is not available"), 404);
});

publicStatusApi.get("/monitors", async (c) => {
  const response = await buildPublicStatusResponse(
    c.env.DB,
    backendSource(c.req.header("x-uptime-lofi-backend-id")),
    c.req.query("slug") ?? null,
  );

  return response
    ? c.json({ data: response.monitors })
    : c.json(structuredError("public_status_unavailable", "Public Status is not available"), 404);
});

function backendSource(backendId?: string): BackendSource {
  return {
    backend_id: backendId || "default",
    backend_label: "Default backend",
    backend_type: "cloudflare_worker",
  };
}

export { publicStatusApi };
