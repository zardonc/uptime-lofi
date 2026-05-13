import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { Bindings } from "./api";
import { dashboardAuthMiddleware } from "../middleware/dashboardAuth";
import { decompress } from "../utils/compression";

const nodesApi = new Hono<{ Bindings: Bindings }>();

const FORBIDDEN_EDIT_KEYS = new Set(['node_secret', 'psk', 'salt', 'api_secret_key']);
const NODE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const DEFAULT_PROBE_RELEASE_REPO = 'zardonc/uptime-lofi';
const DEFAULT_PROBE_RELEASE_TAG = 'probe-latest';
const AGENT_PUSH_STALE_AFTER_SECONDS = 2 * 60;

const probeConfigSchema = z.object({
  name: z.string().trim().min(1).max(80),
  platform: z.enum(['linux/amd64', 'linux/arm64', 'darwin/amd64', 'darwin/arm64']).optional().default('linux/amd64'),
});

const nodeTypeSchema = z.enum(['agent_push', 'agentless_http', 'agentless_tcp']);
const httpConfigSchema = z.object({
  url: z.string().url(),
  interval: z.number().int().min(30).max(86400),
  timeout: z.number().int().min(1).max(300),
  expected_status: z.number().int().min(100).max(599),
}).strict();
const tcpConfigSchema = z.object({
  host: z.string().trim().min(1).max(253),
  port: z.number().int().min(1).max(65535),
  timeout: z.number().int().min(1).max(300),
  interval: z.number().int().min(30).max(86400),
}).strict();
const createNodeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: nodeTypeSchema,
  config: z.unknown().optional(),
}).strict();
const updateNodeSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  status: z.enum(['paused', 'offline']).optional(),
  config: z.unknown().optional(),
}).strict();

type NodeRecord = {
  id: string;
  name: string;
  type: string;
  status: string;
  last_heartbeat?: number | null;
  archived_at?: number | null;
  updated_at?: number | null;
  config_json?: string | null;
};

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

function releaseDownloads(repo: string, tag: string) {
  const base = `https://github.com/${repo}/releases/download/${tag}`;
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

function probePushEndpoint(baseUrl: string) {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return trimmed.endsWith('/api/push') ? trimmed : `${trimmed}/api/push`;
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
  readonly nodeId: string;
  readonly nodeSecret: string;
  readonly releaseRepo: string;
  readonly releaseTag: string;
}) {
  return [
    `curl -fsSL ${shellQuote(data.installScriptUrl)}`,
    '|',
    `UPTIME_PLATFORM=${shellQuote(data.platform)}`,
    `UPTIME_PROBE_PUSH_URL=${shellQuote(data.probePushUrl)}`,
    `UPTIME_NODE_ID=${shellQuote(data.nodeId)}`,
    `UPTIME_NODE_SECRET=${shellQuote(data.nodeSecret)}`,
    `UPTIME_RELEASE_REPO=${shellQuote(data.releaseRepo)}`,
    `UPTIME_RELEASE_TAG=${shellQuote(data.releaseTag)}`,
    'bash',
  ].join(' ');
}

function containsForbiddenEditKey(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) => {
    const normalized = key.toLowerCase();
    return FORBIDDEN_EDIT_KEYS.has(normalized) || normalized.includes('secret') || containsForbiddenEditKey(nested);
  });
}

function validateNodeId(id: string) {
  return NODE_ID_PATTERN.test(id);
}

function configSchemaForType(type: string) {
  if (type === 'agentless_http') return httpConfigSchema;
  if (type === 'agentless_tcp') return tcpConfigSchema;
  return z.unknown().optional().transform(() => null);
}

function safeParseConfig(configJson: string | null | undefined) {
  return configJson ? JSON.parse(configJson) : null;
}

async function safeParseContainers(value: unknown) {
  if (!value) return null;
  try {
    return JSON.parse(await decompress(String(value)));
  } catch {
    return null;
  }
}

function normalizeNode(row: NodeRecord) {
  return {
    ...row,
    status: deriveStatus(row),
    config: safeParseConfig(row.config_json),
  };
}

function deriveStatus(row: NodeRecord) {
  if (row.type !== 'agent_push' || row.status !== 'online') return row.status;
  const lastHeartbeat = typeof row.last_heartbeat === 'number' ? row.last_heartbeat : null;
  if (lastHeartbeat == null) return 'offline';
  return Math.floor(Date.now() / 1000) - lastHeartbeat > AGENT_PUSH_STALE_AFTER_SECONDS ? 'offline' : 'online';
}

async function activeNameExists(db: D1Database, name: string, excludeId?: string) {
  const normalized = name.trim().toLowerCase();
  if (excludeId) {
    const row = await db.prepare(
      `SELECT id FROM nodes WHERE archived_at IS NULL AND lower(name) = ? AND id != ? LIMIT 1`,
    ).bind(normalized, excludeId).first<{ id: string }>();
    return Boolean(row);
  }
  const row = await db.prepare(
    `SELECT id FROM nodes WHERE archived_at IS NULL AND lower(name) = ? LIMIT 1`,
  ).bind(normalized).first<{ id: string }>();
  return Boolean(row);
}

function resumeStatus(current: NodeRecord) {
  if (current.type !== 'agent_push') return 'offline';
  const lastHeartbeat = typeof current.last_heartbeat === 'number' ? current.last_heartbeat : null;
  if (lastHeartbeat == null) return 'offline';
  return Math.floor(Date.now() / 1000) - lastHeartbeat <= AGENT_PUSH_STALE_AFTER_SECONDS ? 'online' : 'offline';
}

 nodesApi.get("/", async (c) => {
  const db = c.env.DB;
  const since = Math.floor(Date.now() / 1000) - 24 * 3600;
  const { results } = await db.prepare(
    `SELECT
       n.*,
       lm.ping_ms,
       lm.cpu_usage,
       lm.mem_usage,
       (
         SELECT AVG(CASE WHEN r.is_up THEN 1.0 ELSE 0.0 END) * 100
         FROM raw_metrics r
         WHERE r.node_id = n.id AND r.timestamp > ?
       ) AS uptime_ratio
     FROM nodes n
      LEFT JOIN raw_metrics lm ON lm.id = (
        SELECT id
        FROM raw_metrics
        WHERE node_id = n.id
        ORDER BY timestamp DESC, id DESC
        LIMIT 1
      )
      WHERE n.archived_at IS NULL
      ORDER BY n.status DESC, n.last_heartbeat DESC`
  ).bind(since).all();

  // Try parsing config_json for each node if it exists
  const nodes = results.map((node) => normalizeNode(node as NodeRecord));

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
    if (await activeNameExists(c.env.DB, name)) return c.json({ error: "A node with this name already exists" }, 409);
    const nodeId = crypto.randomUUID();
    const salt = crypto.randomUUID();
    const nodeSecret = await deriveNodeSecret(c.env.API_SECRET_KEY, nodeId, salt);
    const probePushUrl = probePushEndpoint(c.env.PROBE_PUSH_URL ?? new URL(c.req.url).origin);
    const releaseRepo = c.env.PROBE_RELEASE_REPO ?? c.env.GITHUB_REPOSITORY ?? DEFAULT_PROBE_RELEASE_REPO;
    const releaseTag = c.env.PROBE_RELEASE_TAG ?? DEFAULT_PROBE_RELEASE_TAG;
    const scriptUrl = installScriptUrl(releaseRepo, releaseTag);

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
         install_command: createInstallCommand({
          installScriptUrl: scriptUrl,
          platform,
          probePushUrl,
          nodeId,
          nodeSecret,
          releaseRepo,
          releaseTag,
        }),
        install_script_url: scriptUrl,
         config_yaml: createConfigYaml(probePushUrl, nodeId, nodeSecret),
         downloads: releaseDownloads(releaseRepo, releaseTag),
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
    const id = c.req.param("id") ?? "";
    // Validate node_id against allowed pattern to prevent injection
    if (!validateNodeId(id)) {
      return c.json({ error: "Invalid node id" }, 400);
    }
    const { hours } = c.req.valid("query");

  const since = Math.floor(Date.now() / 1000) - hours * 3600;

  // SECURITY: D1 prepared statements use parameterized queries (.bind())
  // This prevents SQL injection. Never use string concatenation in queries.
  const { results } = await db.prepare(
    `SELECT *, cpu_usage AS cpu_percent, mem_usage AS mem_percent
     FROM raw_metrics
     WHERE node_id = ? AND timestamp > ?
     ORDER BY timestamp ASC`
  ).bind(id, since).all();

    // Map containers_json — decompress if compressed (gz: prefix), then parse JSON
    const metrics = await Promise.all(results.map(async (m) => ({
      ...m,
      containers: await safeParseContainers(m.containers_json)
    })));

    return c.json({ data: metrics });
  }
);


// Create node
nodesApi.post("/", dashboardAuthMiddleware, async (c) => {
  const payload = await c.req.json().catch(() => null);
  if (containsForbiddenEditKey(payload)) return c.json({ error: "Secret fields cannot be edited" }, 400);

  const parsed = createNodeSchema.safeParse(payload);
  if (!parsed.success) return c.json({ error: "Invalid node payload" }, 400);

  const configResult = configSchemaForType(parsed.data.type).safeParse(parsed.data.config);
  if (!configResult.success) return c.json({ error: "Invalid node config" }, 400);
  if (await activeNameExists(c.env.DB, parsed.data.name)) return c.json({ error: "A node with this name already exists" }, 409);

  const now = Math.floor(Date.now() / 1000);
  const node = {
    id: crypto.randomUUID(),
    name: parsed.data.name,
    type: parsed.data.type,
    status: "offline",
    config: configResult.data,
    created_at: now,
    updated_at: now,
  };

  await c.env.DB.prepare(
    `INSERT INTO nodes (id, name, type, status, config_json, created_at, updated_at)
     VALUES (?, ?, ?, 'offline', ?, ?, ?)`
  ).bind(node.id, node.name, node.type, JSON.stringify(node.config), now, now).run();

  return c.json({ data: node });
});

// Update node
nodesApi.put("/:id", dashboardAuthMiddleware, async (c) => {
  const id = c.req.param("id") ?? "";
  if (!validateNodeId(id)) return c.json({ error: "Invalid node id" }, 400);

  const payload = await c.req.json().catch(() => null);
  if (containsForbiddenEditKey(payload)) return c.json({ error: "Secret fields cannot be edited" }, 400);

  const parsed = updateNodeSchema.safeParse(payload);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return c.json({ error: "Invalid node update" }, 400);
  }

  const current = await c.env.DB.prepare(
    "SELECT id, name, type, status, last_heartbeat, config_json FROM nodes WHERE id = ? AND archived_at IS NULL"
  ).bind(id).first<NodeRecord>();
  if (!current) return c.json({ error: "Node not found" }, 404);

  if (parsed.data.name && await activeNameExists(c.env.DB, parsed.data.name, id)) {
    return c.json({ error: "A node with this name already exists" }, 409);
  }

  const nextStatus = parsed.data.status === 'offline' ? resumeStatus(current) : parsed.data.status ?? current.status;
  if (parsed.data.status && current.status !== 'paused' && parsed.data.status !== 'paused') {
    return c.json({ error: "Status edits are limited to pause or resume" }, 400);
  }

  const currentConfig = safeParseConfig(current.config_json);
  const config = parsed.data.config === undefined ? currentConfig : parsed.data.config;
  const configResult = configSchemaForType(current.type).safeParse(config);
  if (!configResult.success) return c.json({ error: "Invalid node config" }, 400);

  const now = Math.floor(Date.now() / 1000);
  const nextHeartbeat = parsed.data.status === 'offline' && nextStatus === 'online' ? now : current.last_heartbeat ?? null;
  await c.env.DB.prepare(
    `UPDATE nodes
     SET name = ?, status = ?, last_heartbeat = ?, config_json = ?, updated_at = ?
     WHERE id = ? AND archived_at IS NULL`
  ).bind(
    parsed.data.name ?? current.name,
    nextStatus,
    nextHeartbeat,
    JSON.stringify(configResult.data),
    now,
    id,
  ).run();

  return c.json({
    data: {
      id,
      name: parsed.data.name ?? current.name,
      type: current.type,
      status: nextStatus,
      config: configResult.data,
      updated_at: now,
    },
  });
});

// Delete node
nodesApi.delete("/:id", dashboardAuthMiddleware, async (c) => {
  const id = c.req.param("id") ?? "";
  if (!validateNodeId(id)) return c.json({ error: "Invalid node id" }, 400);

  const now = Math.floor(Date.now() / 1000);
  const result = await c.env.DB.prepare(
    `UPDATE nodes SET archived_at = ?, status = 'paused', updated_at = ? WHERE id = ? AND archived_at IS NULL`
  ).bind(now, now, id).run();

  if (!result.meta.changes) return c.json({ error: "Node not found" }, 404);
  return c.json({ data: { id, status: "paused", archived_at: now, updated_at: now } });
});

export { nodesApi };
