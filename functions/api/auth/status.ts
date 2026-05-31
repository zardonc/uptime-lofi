import { hasValidSession, json } from "../../lib/session";
import type { PagesFunctionContext, SessionEnv } from "../../lib/session";

export async function onRequestGet(context: PagesFunctionContext<SessionEnv>): Promise<Response> {
  const hasCustomPassword = Boolean(context.env.PAGES_ADMIN_PASSWORD ?? context.env.ADMIN_PASSWORD);

  return json({
    authenticated: await hasValidSession(context.request, context.env),
    is_ui_lock_enabled: hasCustomPassword,
    has_refresh_cookie: false,
  });
}
