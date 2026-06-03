export type BackendSource = {
  readonly backend_id: string;
  readonly backend_label: string;
  readonly backend_type?: "cloudflare_worker" | "custom";
};

export type FunctionsEnv = {
  readonly BACKEND_URL: string;
  readonly INTERNAL_API_KEY: string;
  readonly BACKEND_LABEL?: string;
};

export type BackendForwardRequest = {
  readonly path: string;
  readonly method?: string;
  readonly headers?: HeadersInit;
  readonly body?: BodyInit | null;
};

export type BackendRouter = {
  readonly source: BackendSource;
  forwardAdminRequest(request: BackendForwardRequest): Promise<Response>;
  forwardPublicRequest(request: BackendForwardRequest): Promise<Response>;
};

export const DEFAULT_BACKEND_SOURCE: BackendSource = {
  backend_id: "default",
  backend_label: "Default backend",
  backend_type: "cloudflare_worker",
};
