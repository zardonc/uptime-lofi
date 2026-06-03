import { jsonError } from "./response";
import type { BackendForwardRequest, BackendRouter, BackendSource, FunctionsEnv } from "./types";

export class DefaultBackendAdapter implements BackendRouter {
  readonly source: BackendSource;

  private readonly backendUrl: string;
  private readonly internalApiKey: string;

  constructor(env: FunctionsEnv) {
    this.backendUrl = env.BACKEND_URL.replace(/\/+$/, "");
    this.internalApiKey = env.INTERNAL_API_KEY;
    this.source = {
      backend_id: "default",
      backend_label: env.BACKEND_LABEL ?? "Default backend",
      backend_type: "cloudflare_worker",
    };
  }

  forwardAdminRequest(request: BackendForwardRequest): Promise<Response> {
    return this.forward(request, true);
  }

  forwardPublicRequest(request: BackendForwardRequest): Promise<Response> {
    return this.forward(request, false);
  }

  private async forward(request: BackendForwardRequest, authenticated: boolean): Promise<Response> {
    try {
      const headers = new Headers(request.headers);
      // Phase 11 supports one active backend. The backend_id field stays stable for future aggregation.
      headers.set("x-uptime-lofi-backend-id", "default");
      if (authenticated) {
        headers.set("x-uptime-lofi-internal-key", this.internalApiKey);
      }

      return fetch(this.urlFor(request.path), {
        method: request.method ?? "GET",
        headers,
        body: request.body ?? null,
      });
    } catch (error) {
      return jsonError(error);
    }
  }

  private urlFor(path: string): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${this.backendUrl}${normalizedPath}`;
  }
}
