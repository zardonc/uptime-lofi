import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import app from "../../src/index";

describe("Internal Monitor Routes (/api/internal/v1/monitors)", () => {
  let testEnv: any;

  beforeEach(async () => {
    testEnv = {
      ...env,
      API_SECRET_KEY: "test_admin_key",
      INTERNAL_API_KEY: "test_internal_key",
      SESSION_BLACKLIST: {
        store: new Map(),
        async get(key: string) { return this.store.get(key) || null; },
      },
    };

    const db = (env as any).DB;
    await db.prepare("DELETE FROM monitor_latest").run();
    await db.prepare("DELETE FROM agent_metrics").run();
    await db.prepare("DELETE FROM check_results").run();
    await db.prepare("DELETE FROM monitors").run();
  });

  const request = (path: string, init: RequestInit = {}) => app.fetch(
    new Request(`http://localhost${path}`, {
      ...init,
      headers: {
        "x-uptime-lofi-internal-key": "test_internal_key",
        "Content-Type": "application/json",
        ...init.headers,
      },
    }),
    testEnv,
  );

  it("requires the Pages Functions internal key", async () => {
    const res = await app.fetch(new Request("http://localhost/api/internal/v1/monitors"), testEnv);

    expect(res.status).toBe(401);
  });

  it("creates and lists agent, HTTP, and TCP monitors as one v2 domain", async () => {
    const agent = await request("/api/internal/v1/monitors", {
      method: "POST",
      body: JSON.stringify({ name: "Edge Agent", type: "agent", interval_sec: 60, timeout_sec: 10 }),
    });
    const http = await request("/api/internal/v1/monitors", {
      method: "POST",
      body: JSON.stringify({
        name: "Homepage",
        type: "http",
        interval_sec: 300,
        timeout_sec: 10,
        config: { url: "https://example.com/health", expected_status: 200 },
      }),
    });
    const tcp = await request("/api/internal/v1/monitors", {
      method: "POST",
      body: JSON.stringify({
        name: "Postgres",
        type: "tcp",
        interval_sec: 300,
        timeout_sec: 5,
        config: { host: "db.example.com", port: 5432 },
      }),
    });

    expect(agent.status).toBe(200);
    expect(http.status).toBe(200);
    expect(tcp.status).toBe(200);

    const list = await request("/api/internal/v1/monitors");
    const body: any = await list.json();
    expect(body.data.map((monitor: any) => monitor.type).sort()).toEqual(["agent", "http", "tcp"]);
    expect(body.data.find((monitor: any) => monitor.name === "Homepage")).toMatchObject({
      backend_id: "default",
      backend_label: "Default backend",
      type: "http",
      target: { label: "https://example.com/health", url: "https://example.com/health" },
      latest: {
        checked_at: null,
        latency_ms: null,
        uptime_ratio: null,
        cpu_percent: null,
        mem_percent: null,
        error_text: null,
      },
    });
  });

  it("rejects invalid type-specific config before storage", async () => {
    const badHttp = await request("/api/internal/v1/monitors", {
      method: "POST",
      body: JSON.stringify({ name: "Broken HTTP", type: "http", config: { expected_status: 200 } }),
    });
    const badTcp = await request("/api/internal/v1/monitors", {
      method: "POST",
      body: JSON.stringify({ name: "Broken TCP", type: "tcp", config: { host: "db.example.com" } }),
    });

    expect(badHttp.status).toBe(400);
    expect(badTcp.status).toBe(400);

    const count = await (env as any).DB.prepare("SELECT COUNT(*) AS count FROM monitors").first("count");
    expect(count).toBe(0);
  });

  it("creates an Agent Probe config with an install command and monitor credential", async () => {
    const res = await request("/api/internal/v1/monitors/probe-config", {
      method: "POST",
      body: JSON.stringify({ name: "Installable Agent", platform: "linux/arm64", public_visible: false }),
    });
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data.monitor_id).toEqual(expect.any(String));
    expect(body.data.monitor_secret).toMatch(/^[0-9a-f]{64}$/);
    expect(body.data.install_command).toContain("UPTIME_PLATFORM='linux/arm64'");
    expect(body.data.install_command).toContain(`UPTIME_MONITOR_ID='${body.data.monitor_id}'`);
    expect(body.data.install_command).toContain(`UPTIME_MONITOR_SECRET='${body.data.monitor_secret}'`);
    expect(body.data.install_command).toContain("releases/download/probe-latest/install-probe.sh");
    expect(body.data.install_command).not.toContain("test_admin_key");
    expect(body.data.config_yaml).toContain(`monitor_id: ${body.data.monitor_id}`);
    expect(body.data.config_yaml).toContain(`psk: ${body.data.monitor_secret}`);

    const row = await (env as any).DB.prepare("SELECT type, salt, public_visible FROM monitors WHERE id = ?")
      .bind(body.data.monitor_id)
      .first() as { type: string; salt: string; public_visible: number } | null;
    expect(row).toMatchObject({ type: "agent", public_visible: 0 });
    expect(row?.salt).toEqual(expect.any(String));
  });

  it("returns a structured error when probe credential generation is not configured", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/internal/v1/monitors/probe-config", {
        method: "POST",
        headers: {
          "x-uptime-lofi-internal-key": "test_internal_key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Missing Secret Agent", platform: "linux/amd64" }),
      }),
      { ...testEnv, API_SECRET_KEY: "" },
    );
    const body = await res.json() as any;

    expect(res.status).toBe(500);
    expect(body.error).toEqual({
      code: "probe_secret_not_configured",
      message: "Probe credential generation is not configured. Set API_SECRET_KEY on the dashboard Worker and redeploy.",
    });
  });

  it("updates safe fields, pauses, resumes, and archives without deleting history", async () => {
    const created = await request("/api/internal/v1/monitors", {
      method: "POST",
      body: JSON.stringify({
        name: "Lifecycle HTTP",
        type: "http",
        config: { url: "https://example.com", expected_status: 200 },
      }),
    });
    const id = ((await created.json()) as any).data.id;
    await (env as any).DB.prepare(
      "INSERT INTO check_results (monitor_id, timestamp, status, latency_ms, detail_json) VALUES (?, ?, ?, ?, ?)",
    ).bind(id, Math.floor(Date.now() / 1000), "up", 42, "{}").run();

    const updated = await request(`/api/internal/v1/monitors/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name: "Renamed HTTP", interval_sec: 120, public_visible: false }),
    });
    const paused = await request(`/api/internal/v1/monitors/${id}/pause`, { method: "POST" });
    const resumed = await request(`/api/internal/v1/monitors/${id}/resume`, { method: "POST" });
    const archived = await request(`/api/internal/v1/monitors/${id}`, { method: "DELETE" });

    expect(updated.status).toBe(200);
    expect(((await updated.json()) as any).data.name).toBe("Renamed HTTP");
    expect(paused.status).toBe(200);
    expect(((await paused.json()) as any).data.status).toBe("paused");
    expect(resumed.status).toBe(200);
    expect(((await resumed.json()) as any).data.status).toBe("unknown");
    expect(archived.status).toBe(200);

    const list = await request("/api/internal/v1/monitors");
    expect(((await list.json()) as any).data).toHaveLength(0);
    const history = await (env as any).DB.prepare("SELECT COUNT(*) AS count FROM check_results WHERE monitor_id = ?")
      .bind(id)
      .first("count");
    expect(history).toBe(1);
  });
});
