import { createSessionCookie, json, readPassword, verifyAdminPassword } from "../../lib/session";
import type { FunctionsEnv } from "../../lib/types";
import type { PagesFunctionContext, SessionEnv } from "../../lib/session";

type LoginEnv = FunctionsEnv & SessionEnv;

export async function onRequestPost(context: PagesFunctionContext<LoginEnv>): Promise<Response> {
  if (context.env.BACKEND_URL) {
    const backendResponse = await fetch(`${context.env.BACKEND_URL.replace(/\/+$/, "")}/api/auth/login`, {
      method: "POST",
      headers: loginHeaders(context.request.headers),
      body: await context.request.text(),
    });

    if (!backendResponse.ok) {
      return normalizeBackendAuthError(backendResponse);
    }

    return json(
      { authenticated: true },
      { headers: { "Set-Cookie": await createSessionCookie(context.env) } },
    );
  }

  const password = await readPassword(context.request);
  if (!password || !await verifyAdminPassword(context.env, password)) {
    return json({ error: { code: "unauthorized", message: "Invalid credentials" } }, { status: 401 });
  }

  return json(
    { authenticated: true },
    { headers: { "Set-Cookie": await createSessionCookie(context.env) } },
  );
}

function loginHeaders(source: Headers): Headers {
  const headers = new Headers();
  const contentType = source.get("Content-Type");
  const cfConnectingIp = source.get("CF-Connecting-IP");
  const forwardedFor = source.get("X-Forwarded-For");

  headers.set("Content-Type", contentType ?? "application/json");
  if (cfConnectingIp) headers.set("CF-Connecting-IP", cfConnectingIp);
  if (forwardedFor) headers.set("X-Forwarded-For", forwardedFor);

  return headers;
}

async function normalizeBackendAuthError(response: Response): Promise<Response> {
  try {
    return json(await response.json(), { status: response.status });
  } catch {
    return json(
      { error: { code: "unauthorized", message: response.statusText || "Invalid credentials" } },
      { status: response.status },
    );
  }
}
