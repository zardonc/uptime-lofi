import { Hono } from "hono";
import { strictRateLimit, standardRateLimit } from "../middleware/rateLimiter";
import { dashboardAuthMiddleware } from "../middleware/dashboardAuth";
import { nodesApi } from "./nodes";
import { statsApi } from "./stats";
import { authApi } from "./auth";
import { settingsApi } from "./settings";
import { agentlessApi } from "./agentless";
import { internalApi } from "./internal";
import { publicStatusApi } from "./publicStatus";
import { monitorsApi } from "./monitors";
import { alertsApi } from "./alerts";
import { notificationsApi } from "./notifications";
import { statisticsApi } from "./statistics";

// Rate-limiting: apply before authentication on selected routes

export type Bindings = {
  DB: D1Database;
  API_SECRET_KEY: string;
  // JWT configuration
  JWT_AUDIENCE?: string;
  JWT_ISSUER?: string;
  // Emergency unlock key for break-glass access
  EMERGENCY_UNLOCK_KEY?: string;
  // Comma-separated list of allowed origins for production CORS
  CORS_ORIGINS?: string;
  // Deployed Probe Worker base URL for generated probe configs
  PROBE_PUSH_URL?: string;
  // GitHub repository slug that hosts probe release assets
  PROBE_RELEASE_REPO?: string;
  // GitHub Actions-style repository slug fallback for generated installer URLs
  GITHUB_REPOSITORY?: string;
  // GitHub release tag that hosts probe binaries
  PROBE_RELEASE_TAG?: string;
  // KV namespace for instant session blacklist (logout revocation)
  SESSION_BLACKLIST: KVNamespace;
  // Rebuildable cache for v2 statistics read models.
  STATISTICS_CACHE?: KVNamespace;
  // Server-side key used by Pages Functions to call Worker internal v2 APIs.
  INTERNAL_API_KEY?: string;
};

const api = new Hono<{ Bindings: Bindings }>();

// Rate-limiting: apply before authentication on selected routes
// Specific routes must come BEFORE wildcard routes (Hono ordering)
api.use("/auth/setup", strictRateLimit);
api.use("/auth/unlock", strictRateLimit);
api.use("/auth/login", strictRateLimit);
api.use("/auth/*", standardRateLimit);
api.use("/nodes", standardRateLimit);
api.use("/agentless", standardRateLimit);
api.use("/stats", standardRateLimit);
api.use("/internal/*", standardRateLimit);
api.use("/v1/*", standardRateLimit);
api.use("/public/*", standardRateLimit);

// Note: /push route moved to dedicated probe Worker (probe-wrangler.toml)

// 1. Unprotected auth endpoints
api.route("/auth", authApi);

// 2. Internal v2 endpoints for Pages Functions only
api.route("/internal/v1", internalApi);

// 3. Public read-only v2 endpoints
api.route("/public", publicStatusApi);

// 4. Protected Dashboard endpoints
const dashboard = new Hono<{ Bindings: Bindings }>();
dashboard.use("*", dashboardAuthMiddleware);
dashboard.route("/nodes", nodesApi);
dashboard.route("/agentless", agentlessApi);
dashboard.route("/stats", statsApi);
dashboard.route("/settings", settingsApi);
dashboard.route("/v1/monitors", monitorsApi);
dashboard.route("/v1/alerts", alertsApi);
dashboard.route("/v1/notifications", notificationsApi);
dashboard.route("/v1/statistics", statisticsApi);
api.route("/", dashboard);

export { api };
