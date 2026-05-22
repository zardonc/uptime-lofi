import { hasValidSession, json } from "../../lib/session";
import type { PagesFunctionContext, SessionEnv } from "../../lib/session";

export async function onRequestGet(context: PagesFunctionContext<SessionEnv>): Promise<Response> {
  return json({
    authenticated: await hasValidSession(context.request, context.env),
  });
}
