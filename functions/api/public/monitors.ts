import { DefaultBackendAdapter } from "../../lib/backendRouter";
import { structuredError } from "../../lib/response";
import type { BackendRouter, FunctionsEnv } from "../../lib/types";
import type { PagesFunctionContext } from "../../lib/session";

export async function onRequest(context: PagesFunctionContext<FunctionsEnv>): Promise<Response> {
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return Response.json(structuredError("method_not_allowed", "Public monitors are read-only"), { status: 405 });
  }

  const router: BackendRouter = new DefaultBackendAdapter(context.env);
  return router.forwardPublicRequest({
    path: publicPath(context.request, "/api/public/monitors"),
    method: context.request.method,
    headers: forwardHeaders(context.request.headers),
  });
}

function publicPath(request: Request, path: string): string {
  const url = new URL(request.url);
  return `${path}${url.search}`;
}

function forwardHeaders(source: Headers): Headers {
  const headers = new Headers();
  const accept = source.get("Accept");
  if (accept) headers.set("Accept", accept);
  return headers;
}
