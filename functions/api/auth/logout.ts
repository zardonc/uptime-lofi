import { clearSessionCookie, json } from "../../lib/session";
import type { PagesFunctionContext } from "../../lib/session";

export async function onRequestPost(_context: PagesFunctionContext): Promise<Response> {
  return json(
    { success: true },
    { headers: { "Set-Cookie": clearSessionCookie() } },
  );
}
