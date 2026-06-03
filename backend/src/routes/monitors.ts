import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
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
const DEFAULT_PROBE_RELEASE_REPO = "zardonc/uptime-lofi";
const DEFAULT_PROBE_RELEASE_TAG = "probe-latest";
const probeConfigSchema = z.object({
  name: z.string().trim().min(1).max(80),
  platform: z.enum(["linux/amd64", "linux/arm64", "darwin/amd64", "darwin/arm64"]).optional().default("linux/amd64"),
  public_visible: z.boolean().optional().default(true),
});

monitorsApi.get("/", async (c) => {
  return c.json({ data: await listMonitors(c.env.DB, backendSource(c.req.header("x-uptime-lofi-backend-id"))) });
});

monitorsApi.get("/:id", async (c) => {
  const id = c.req.param("id") ?? "";
  if (!validMonitorId(id)) return c.json(structuredError("invalid_monitor_id", "Invalid monitor id"), 400);

  const monitor = await getMonitor(c.env.DB, id, backendSource(c.req.header("x-uptime-lofi-backend-id")));
  return monitor ? c.json({ data: monitor }) : c.json(structuredError("monitor_not_found", "Monitor not found"), 404);
});

monitorsApi.post(
  "/probe-config",
  zValidator("json", probeConfigSchema, (result, c) => {
    if (!result.success) {
      return c.json(structuredError("invalid_probe_config", "Invalid probe config request"), 400);
    }
  }),
  async (c) => {
    const { name, platform, public_visible: publicVisible } = c.req.valid("json");
    const apiSecret = configuredSecret(c.env.API_SECRET_KEY);
    if (!apiSecret) {
      return c.json(structuredError(
        "probe_secret_not_configured",
        "Probe credential generation is not configured. Set API_SECRET_KEY on the dashboard Worker and redeploy.",
      ), 500);
    }

    if (await activeNameExists(c.env.DB, name)) {
      return c.json(structuredError("monitor_name_exists", "A monitor with this name already exists"), 409);
    }

    const monitorId = crypto.randomUUID();
    const salt = crypto.randomUUID();
    const monitorSecret = await deriveMonitorSecret(apiSecret, monitorId, salt);
    const probePushUrl = probePushEndpoint(c.env.PROBE_PUSH_URL ?? new URL(c.req.url).origin);
    const releaseRepo = c.env.PROBE_RELEASE_REPO ?? c.env.GITHUB_REPOSITORY ?? DEFAULT_PROBE_RELEASE_REPO;
    const releaseTag = c.env.PROBE_RELEASE_TAG ?? DEFAULT_PROBE_RELEASE_TAG;
    const scriptUrl = installScriptUrl(releaseRepo, releaseTag);
    const now = Math.floor(Date.now() / 1000);

    await c.env.DB.prepare(
      `INSERT INTO monitors (
         id, backend_id, name, type, target, interval_sec, timeout_sec,
         expected_json, config_json, salt, paused, public_visible, created_at, updated_at
       ) VALUES (?, 'default', ?, 'agent', 'Agent probe', 60, 10, NULL, ?, ?, 0, ?, ?, ?)`,
    ).bind(
      monitorId,
      name,
      JSON.stringify({
        platform,
        generated_by: "dashboard_probe_config",
        credential_version: 1,
      }),
      salt,
      publicVisible ? 1 : 0,
      now,
      now,
    ).run();

    return c.json({
      data: {
        monitor_id: monitorId,
        monitor_name: name,
        monitor_secret: monitorSecret,
        probe_push_url: probePushUrl,
        install_command: createInstallCommand({
          installScriptUrl: scriptUrl,
          platform,
          probePushUrl,
          monitorId,
          monitorSecret,
          releaseRepo,
          releaseTag,
        }),
        install_script_url: scriptUrl,
        config_yaml: createConfigYaml(probePushUrl, monitorId, monitorSecret),
        downloads: releaseDownloads(releaseRepo, releaseTag),
      },
    });
  },
);

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

function configuredSecret(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

async function deriveMonitorSecret(masterSecret: string, monitorId: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(masterSecret);
  const messageData = encoder.encode(`${monitorId}:${salt}`);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function releaseDownloads(repo: string, tag: string) {
  const base = `https://github.com/${repo}/releases/download/${tag}`;
  return {
    linux_amd64: `${base}/probe-linux-amd64.tar.gz`,
    linux_arm64: `${base}/probe-linux-arm64.tar.gz`,
    darwin_amd64: `${base}/probe-darwin-amd64.tar.gz`,
    darwin_arm64: `${base}/probe-darwin-arm64.tar.gz`,
  };
}

function createConfigYaml(apiUrl: string, monitorId: string, monitorSecret: string) {
  return [
    `api_url: ${apiUrl}`,
    `monitor_id: ${monitorId}`,
    `psk: ${monitorSecret}`,
    "enable_docker: true",
    "",
  ].join("\n");
}

function probePushEndpoint(baseUrl: string) {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/api/push") ? trimmed : `${trimmed}/api/push`;
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function installScriptUrl(repo: string, tag: string) {
  return `https://github.com/${repo}/releases/download/${tag}/install-probe.sh`;
}

function createInstallCommand(data: {
  readonly installScriptUrl: string;
  readonly platform: string;
  readonly probePushUrl: string;
  readonly monitorId: string;
  readonly monitorSecret: string;
  readonly releaseRepo: string;
  readonly releaseTag: string;
}) {
  return [
    `curl -fsSL ${shellQuote(data.installScriptUrl)}`,
    "|",
    `UPTIME_PLATFORM=${shellQuote(data.platform)}`,
    `UPTIME_PROBE_PUSH_URL=${shellQuote(data.probePushUrl)}`,
    `UPTIME_MONITOR_ID=${shellQuote(data.monitorId)}`,
    `UPTIME_MONITOR_SECRET=${shellQuote(data.monitorSecret)}`,
    `UPTIME_RELEASE_REPO=${shellQuote(data.releaseRepo)}`,
    `UPTIME_RELEASE_TAG=${shellQuote(data.releaseTag)}`,
    "bash",
  ].join(" ");
}

async function activeNameExists(db: D1Database, name: string) {
  const row = await db.prepare(
    "SELECT id FROM monitors WHERE archived_at IS NULL AND lower(name) = ? LIMIT 1",
  ).bind(name.trim().toLowerCase()).first<{ id: string }>();
  return Boolean(row);
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
