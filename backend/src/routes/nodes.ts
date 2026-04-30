import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { Bindings } from "./api";
import { dashboardAuthMiddleware } from "../middleware/dashboardAuth";
import { decompress } from "../utils/compression";

const nodesApi = new Hono<{ Bindings: Bindings }>();

const probeConfigSchema = z.object({
  name: z.string().trim().min(1).max(80),
  platform: z.enum(['linux/amd64', 'linux/arm64', 'darwin/amd64', 'darwin/arm64']).optional().default('linux/amd64'),
});

async function deriveNodeSecret(masterSecret: string, nodeId: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(masterSecret);
  const messageData = encoder.encode(`${nodeId}:${salt}`);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function releaseDownloads() {
  const base = 'https://github.com/zardonc/uptime-lofi/releases/latest/download';
  return {
    linux_amd64: `${base}/probe-linux-amd64.tar.gz`,
    linux_arm64: `${base}/probe-linux-arm64.tar.gz`,
    darwin_amd64: `${base}/probe-darwin-amd64.tar.gz`,
    darwin_arm64: `${base}/probe-darwin-arm64.tar.gz`,
  };
}

function createConfigYaml(apiUrl: string, nodeId: string, nodeSecret: string) {
  return [
    `api_url: ${apiUrl}`,
    `node_id: ${nodeId}`,
    `psk: ${nodeSecret}`,
    'enable_docker: true',
    '',
  ].join('\n');
}

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

nodesApi.post(
  "/probe-config",
  zValidator("json", probeConfigSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: "Invalid probe config request" }, 400);
    }
  }),
  async (c) => {
    const { name, platform } = c.req.valid("json");
    const nodeId = crypto.randomUUID();
    const salt = crypto.randomUUID();
    const nodeSecret = await deriveNodeSecret(c.env.API_SECRET_KEY, nodeId, salt);
    const probePushUrl = c.env.PROBE_PUSH_URL ?? new URL(c.req.url).origin;

    await c.env.DB.prepare(
      `INSERT INTO nodes (id, name, type, status, salt, config_json)
       VALUES (?, ?, 'agent_push', 'offline', ?, ?)`
    ).bind(
      nodeId,
      name,
      salt,
      JSON.stringify({
        platform,
        generated_by: 'dashboard_probe_config',
        credential_version: 1,
      })
    ).run();

    return c.json({
      data: {
        node_id: nodeId,
        node_name: name,
        node_secret: nodeSecret,
        probe_push_url: probePushUrl,
        config_yaml: createConfigYaml(probePushUrl, nodeId, nodeSecret),
        downloads: releaseDownloads(),
      },
    });
  }
);

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

    // Map containers_json — decompress if compressed (gz: prefix), then parse JSON
    const metrics = await Promise.all(results.map(async (m) => ({
      ...m,
      containers: m.containers_json ? JSON.parse(await decompress(m.containers_json as string)) : null
    })));

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
