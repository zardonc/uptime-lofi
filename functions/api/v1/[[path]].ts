import { DefaultBackendAdapter } from "../../lib/backendRouter";
import { structuredError } from "../../lib/response";
import { hasValidSession, json } from "../../lib/session";
import type { BackendRouter, FunctionsEnv } from "../../lib/types";
import type { PagesFunctionContext, SessionEnv } from "../../lib/session";

type ProxyEnv = FunctionsEnv & SessionEnv;

export async function onRequest(context: PagesFunctionContext<ProxyEnv>): Promise<Response> {
  if (!await hasValidSession(context.request, context.env)) {
    return json(structuredError("unauthorized", "Admin session required"), { status: 401 });
  }

  const router: BackendRouter = new DefaultBackendAdapter(context.env);
  const backendResponse = await router.forwardAdminRequest({
    path: internalPath(context),
    method: context.request.method,
    headers: forwardHeaders(context.request.headers),
    body: requestBody(context.request),
  });

  if (backendResponse.ok) return backendResponse;
  return normalizeBackendError(backendResponse);
}

function internalPath(context: PagesFunctionContext): string {
  const path = context.params?.path;
  const segments = Array.isArray(path) ? path : path ? [path] : [];
  const suffix = segments.map((segment) => encodeURIComponent(segment)).join("/");
  const url = new URL(context.request.url);
  const query = url.search;
  return `/api/internal/v1${suffix ? `/${suffix}` : ""}${query}`;
}

function forwardHeaders(source: Headers): Headers {
  const headers = new Headers();
  const contentType = source.get("Content-Type");
  if (contentType) headers.set("Content-Type", contentType);
  return headers;
}

function requestBody(request: Request): BodyInit | null {
  return request.method === "GET" || request.method === "HEAD" ? null : request.body;
}

async function normalizeBackendError(response: Response): Promise<Response> {
  let message = response.statusText || "Backend request failed";

  try {
    const body = await response.clone().json() as unknown;
    if (isStructuredError(body)) {
      return json(body, { status: response.status });
    }
    if (isLegacyError(body)) {
      message = body.error;
    }
  } catch {
    const text = await response.text().catch(() => "");
    if (text.trim()) message = text.trim();
  }

  return json(structuredError("backend_error", message), { status: response.status });
}

function isStructuredError(value: unknown): value is ReturnType<typeof structuredError> {
  return Boolean(
    value &&
    typeof value === "object" &&
    "error" in value &&
    typeof (value as { error?: unknown }).error === "object" &&
    typeof ((value as { error?: { code?: unknown } }).error?.code) === "string" &&
    typeof ((value as { error?: { message?: unknown } }).error?.message) === "string",
  );
}

function isLegacyError(value: unknown): value is { readonly error: string } {
  return Boolean(value && typeof value === "object" && typeof (value as { error?: unknown }).error === "string");
}
