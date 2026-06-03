import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:workers";
import app from "../../src/index";
import { onRequestPost as login } from "../../../functions/api/auth/login";
import { onRequestPost as logout } from "../../../functions/api/auth/logout";
import { onRequestGet as status } from "../../../functions/api/auth/status";
import { onRequest as proxy } from "../../../functions/api/v1/[[path]]";
import { onRequest as publicStatus } from "../../../functions/api/public/status";

const pagesEnv = {
  PAGES_ADMIN_PASSWORD: "env-password",
  PAGES_SESSION_SECRET: "pages-session-secret",
  BACKEND_URL: "https://worker.example.test",
  INTERNAL_API_KEY: "internal-test-key",
};

function loginRequest(password: string) {
  return new Request("https://app.example.test/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
}

async function sessionCookie() {
  stubWorkerAuth();
  const res = await login({ request: loginRequest("correct-password"), env: pagesEnv });
  const cookie = res.headers.get("Set-Cookie");
  if (!cookie) throw new Error("login did not set a session cookie");
  return cookie.split(";")[0];
}

function stubWorkerAuth(options: { readonly uiLockEnabled?: boolean; readonly loginStatus?: number } = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "https://worker.example.test/api/auth/status") {
      return Response.json({
        is_ui_lock_enabled: options.uiLockEnabled ?? true,
        has_refresh_cookie: false,
      });
    }

    if (url === "https://worker.example.test/api/auth/login") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { readonly password?: string };
      if ((options.loginStatus ?? 200) === 200 && body.password === "correct-password") {
        return Response.json({ access_token: "worker-access-token" });
      }

      return Response.json(
        { error: { code: "unauthorized", message: "Invalid credentials" } },
        { status: options.loginStatus ?? 401 },
      );
    }

    return Response.json({ error: "unexpected worker request" }, { status: 500 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Pages Functions BFF auth boundary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sets an HttpOnly session cookie on login without returning secrets", async () => {
    const fetchMock = stubWorkerAuth();
    const res = await login({ request: loginRequest("correct-password"), env: pagesEnv });
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://worker.example.test/api/auth/login",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ password: "correct-password" }) }),
    );
    expect(res.headers.get("Set-Cookie")).toContain("HttpOnly");
    expect(res.headers.get("Set-Cookie")).toContain("Secure");
    expect(JSON.stringify(body)).not.toContain("correct-password");
    expect(JSON.stringify(body)).not.toContain("worker-access-token");
    expect(JSON.stringify(body)).not.toContain("internal-test-key");
  });

  it("rejects login when Worker rejects the password", async () => {
    stubWorkerAuth({ loginStatus: 401 });

    const res = await login({ request: loginRequest("correct-password"), env: pagesEnv });
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(401);
    expect(res.headers.get("Set-Cookie")).toBeNull();
    expect(JSON.stringify(body)).toContain("Invalid credentials");
  });

  it("clears the session cookie on logout", async () => {
    const res = await logout({
      request: new Request("https://app.example.test/api/auth/logout", { method: "POST" }),
      env: pagesEnv,
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toContain("ulo_session=;");
    expect(res.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });

  it("reports authenticated status without returning secrets", async () => {
    const cookie = await sessionCookie();
    const res = await status({
      request: new Request("https://app.example.test/api/auth/status", {
        headers: { Cookie: cookie },
      }),
      env: pagesEnv,
    });
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body).toEqual({ authenticated: true, is_ui_lock_enabled: true, has_refresh_cookie: false });
    expect(JSON.stringify(body)).not.toContain("pages-session-secret");
    expect(JSON.stringify(body)).not.toContain("internal-test-key");
  });

  it("rejects unauthenticated admin proxy requests before contacting Worker", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await proxy({
      request: new Request("https://app.example.test/api/v1/status"),
      env: pagesEnv,
      params: { path: ["status"] },
    });

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards authenticated admin proxy requests with the internal key server-side", async () => {
    const cookie = await sessionCookie();
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      return Response.json({
        data: {
          internal_key_seen: headers.get("x-uptime-lofi-internal-key") === "internal-test-key",
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await proxy({
      request: new Request("https://app.example.test/api/v1/status?check=1", {
        headers: { Cookie: cookie },
      }),
      env: pagesEnv,
      params: { path: ["status"] },
    });
    const body = await res.json() as { data: { internal_key_seen: boolean } };

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://worker.example.test/api/internal/v1/status?check=1",
      expect.objectContaining({ method: "GET" }),
    );
    expect(body.data.internal_key_seen).toBe(true);
    expect(JSON.stringify(body)).not.toContain("internal-test-key");
  });

  it("forwards Settings through the authenticated v1 proxy instead of the static Pages fallback", async () => {
    const cookie = await sessionCookie();
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      return Response.json({
        data: {
          internal_key_seen: headers.get("x-uptime-lofi-internal-key") === "internal-test-key",
          is_ui_lock_enabled: true,
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await proxy({
      request: new Request("https://app.example.test/api/v1/settings", {
        headers: { Cookie: cookie },
      }),
      env: pagesEnv,
      params: { path: ["settings"] },
    });
    const body = await res.json() as { data: { internal_key_seen: boolean; is_ui_lock_enabled: boolean } };

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://worker.example.test/api/internal/v1/settings",
      expect.objectContaining({ method: "GET" }),
    );
    expect(body.data).toEqual({ internal_key_seen: true, is_ui_lock_enabled: true });
  });

  it("forwards public status without requiring an admin session", async () => {
    const fetchMock = vi.fn(async () => Response.json({
      status: "online",
      message: "All public systems are operational.",
      updated_at: 1,
      monitors: [{ id: "public-http", name: "Public HTTP", status: "online", updated_at: 1 }],
      incidents: [],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await publicStatus({
      request: new Request("https://app.example.test/api/public/status?slug=team"),
      env: pagesEnv,
    });
    const body = await res.json() as { monitors: Array<{ id: string }> };

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://worker.example.test/api/public/status?slug=team",
      expect.objectContaining({ method: "GET" }),
    );
    expect(body.monitors).toEqual([{ id: "public-http", name: "Public HTTP", status: "online", updated_at: 1 }]);
  });
});

describe("Worker internal v2 auth boundary", () => {
  const workerEnv = {
    ...env,
    INTERNAL_API_KEY: "internal-test-key",
    SESSION_BLACKLIST: {
      async get() { return null; },
      async put() {},
    },
  };

  it("rejects missing internal auth", async () => {
    const res = await app.fetch(new Request("https://worker.example.test/api/internal/v1/status"), workerEnv);
    expect(res.status).toBe(401);
  });

  it("rejects wrong internal auth", async () => {
    const res = await app.fetch(
      new Request("https://worker.example.test/api/internal/v1/status", {
        headers: { "x-uptime-lofi-internal-key": "wrong-key" },
      }),
      workerEnv,
    );

    expect(res.status).toBe(401);
  });

  it("accepts valid internal auth separately from legacy dashboard routes", async () => {
    const res = await app.fetch(
      new Request("https://worker.example.test/api/internal/v1/status", {
        headers: { "x-uptime-lofi-internal-key": "internal-test-key" },
      }),
      workerEnv,
    );
    const body = await res.json() as { data: { ok: boolean; boundary: string } };

    expect(res.status).toBe(200);
    expect(body.data).toEqual({ ok: true, boundary: "internal-v1" });
  });

  it("serves settings on the internal v1 route for Pages Functions", async () => {
    const res = await app.fetch(
      new Request("https://worker.example.test/api/internal/v1/settings", {
        headers: { "x-uptime-lofi-internal-key": "internal-test-key" },
      }),
      workerEnv,
    );
    const body = await res.json() as { data?: { is_ui_lock_enabled?: boolean } };

    expect(res.status).toBe(200);
    expect(body.data).toEqual(expect.objectContaining({ is_ui_lock_enabled: expect.any(Boolean) }));
  });
});
