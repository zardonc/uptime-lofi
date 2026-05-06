import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { Bindings } from "./api";
import { isHttpTargetAllowed, isTcpTargetAllowed } from "../agentless/checks";

const agentlessApi = new Hono<{ Bindings: Bindings }>();

const NODE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

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

type CreateCheckInput = {
  readonly name: string;
  readonly type: "agentless_http" | "agentless_tcp";
  readonly config: Record<string, unknown>;
};
type AgentlessContext = Context<{ Bindings: Bindings }>;

function validNodeId(id: string) {
  return NODE_ID_PATTERN.test(id);
}

async function readJson(c: AgentlessContext) {
  return c.req.json().catch(() => null);
}

async function createCheck(db: D1Database, input: CreateCheckInput) {
  const now = Math.floor(Date.now() / 1000);
  const node = {
    id: crypto.randomUUID(),
    name: input.name,
    type: input.type,
    status: "offline",
    config: input.config,
    created_at: now,
    updated_at: now,
  };
  await db.prepare(
    `INSERT INTO nodes (id, name, type, status, config_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(node.id, node.name, node.type, node.status, JSON.stringify(node.config), now, now).run();
  return node;
}

async function updateCheckStatus(db: D1Database, id: string, status: "paused" | "offline") {
  const now = Math.floor(Date.now() / 1000);
  const result = await db.prepare(
    `UPDATE nodes SET status = ?, updated_at = ?
     WHERE id = ? AND archived_at IS NULL AND type IN ('agentless_http', 'agentless_tcp')`,
  ).bind(status, now, id).run();
  return result.meta.changes ? { id, status, updated_at: now } : null;
}

agentlessApi.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT
       n.id,
       n.name,
       n.type,
       n.status,
       n.config_json,
       n.created_at,
       n.updated_at,
       lm.ping_ms AS latest_ping_ms,
       lm.is_up AS latest_is_up,
       lm.error_text AS latest_error_text,
       lm.timestamp AS latest_timestamp
     FROM nodes n
     LEFT JOIN raw_metrics lm ON lm.id = (
       SELECT id FROM raw_metrics WHERE node_id = n.id ORDER BY timestamp DESC, id DESC LIMIT 1
     )
     WHERE n.archived_at IS NULL AND n.type IN ('agentless_http', 'agentless_tcp')
     ORDER BY n.created_at DESC`,
  ).all();

  return c.json({
    data: results.map((row: any) => ({
      ...row,
      config: row.config_json ? JSON.parse(row.config_json) : null,
    })),
  });
});

agentlessApi.post("/http", async (c) => {
  const parsed = httpPayloadSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: "Invalid agentless HTTP payload" }, 400);
  const allowed = isHttpTargetAllowed(parsed.data.url);
  if (!allowed.allowed) return c.json({ error: allowed.reason ?? "HTTP target is not allowed" }, 400);
  const { name, ...config } = parsed.data;
  const node = await createCheck(c.env.DB, { name, type: "agentless_http", config });
  return c.json({ data: node });
});

agentlessApi.post("/tcp", async (c) => {
  const parsed = tcpPayloadSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: "Invalid agentless TCP payload" }, 400);
  const allowed = isTcpTargetAllowed(parsed.data.host, parsed.data.port);
  if (!allowed.allowed) return c.json({ error: allowed.reason ?? "TCP target is not allowed" }, 400);
  const { name, ...config } = parsed.data;
  const node = await createCheck(c.env.DB, { name, type: "agentless_tcp", config });
  return c.json({ data: node });
});

agentlessApi.post("/:id/pause", async (c) => {
  const id = c.req.param("id");
  if (!validNodeId(id)) return c.json({ error: "Invalid node id" }, 400);
  const node = await updateCheckStatus(c.env.DB, id, "paused");
  return node ? c.json({ data: node }) : c.json({ error: "Agentless check not found" }, 404);
});

agentlessApi.post("/:id/resume", async (c) => {
  const id = c.req.param("id");
  if (!validNodeId(id)) return c.json({ error: "Invalid node id" }, 400);
  const node = await updateCheckStatus(c.env.DB, id, "offline");
  return node ? c.json({ data: node }) : c.json({ error: "Agentless check not found" }, 404);
});

agentlessApi.delete("/:id", async (c) => {
  const id = c.req.param("id");
  if (!validNodeId(id)) return c.json({ error: "Invalid node id" }, 400);
  const now = Math.floor(Date.now() / 1000);
  const result = await c.env.DB.prepare(
    `UPDATE nodes SET archived_at = ?, status = 'paused', updated_at = ?
     WHERE id = ? AND archived_at IS NULL AND type IN ('agentless_http', 'agentless_tcp')`,
  ).bind(now, now, id).run();
  if (!result.meta.changes) return c.json({ error: "Agentless check not found" }, 404);
  return c.json({ data: { id, status: "paused", archived_at: now, updated_at: now } });
});

export { agentlessApi };
