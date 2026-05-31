import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:workers";
import app from "../../src/index";
import { onRequestPost as login } from "../../../functions/api/auth/login";
import { onRequestPost as logout } from "../../../functions/api/auth/logout";
import { onRequestGet as status } from "../../../functions/api/auth/status";
import { onRequest as proxy } from "../../../functions/api/v1/[[path]]";

const pagesEnv = {
  PAGES_ADMIN_PASSWORD: "correct-password",
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
  const res = await login({ request: loginRequest("correct-password"), env: pagesEnv });
  const cookie = res.headers.get("Set-Cookie");
  if (!cookie) throw new Error("login did not set a session cookie");
  return cookie.split(";")[0];
}

describe("Pages Functions BFF auth boundary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sets an HttpOnly session cookie on login without returning secrets", async () => {
    const res = await login({ request: loginRequest("correct-password"), env: pagesEnv });
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toContain("HttpOnly");
    expect(res.headers.get("Set-Cookie")).toContain("Secure");
    expect(JSON.stringify(body)).not.toContain("correct-password");
    expect(JSON.stringify(body)).not.toContain("internal-test-key");
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
});
