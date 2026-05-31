import { hasValidSession, json } from "../../lib/session";
import type { FunctionsEnv } from "../../lib/types";
import type { PagesFunctionContext, SessionEnv } from "../../lib/session";

type StatusEnv = FunctionsEnv & SessionEnv;

export async function onRequestGet(context: PagesFunctionContext<StatusEnv>): Promise<Response> {
  const authenticated = await hasValidSession(context.request, context.env);
  const backendStatus = await readBackendAuthStatus(context.env);

  return json({
    authenticated,
    is_ui_lock_enabled: backendStatus?.is_ui_lock_enabled ?? Boolean(context.env.PAGES_ADMIN_PASSWORD ?? context.env.ADMIN_PASSWORD),
    has_refresh_cookie: false,
  });
}

async function readBackendAuthStatus(env: StatusEnv): Promise<{ readonly is_ui_lock_enabled?: boolean } | null> {
  if (!env.BACKEND_URL) return null;

  try {
    const response = await fetch(`${env.BACKEND_URL.replace(/\/+$/, "")}/api/auth/status`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    return await response.json() as { readonly is_ui_lock_enabled?: boolean };
  } catch {
    return null;
  }
}
