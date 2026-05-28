import { createSessionCookie, json, readPassword, verifyAdminPassword } from "../../lib/session";
import type { PagesFunctionContext, SessionEnv } from "../../lib/session";

export async function onRequestPost(context: PagesFunctionContext<SessionEnv>): Promise<Response> {
  const password = await readPassword(context.request);
  if (!password || !await verifyAdminPassword(context.env, password)) {
    return json({ error: { code: "unauthorized", message: "Invalid credentials" } }, { status: 401 });
  }

  return json(
    { authenticated: true },
    { headers: { "Set-Cookie": await createSessionCookie(context.env) } },
  );
}
