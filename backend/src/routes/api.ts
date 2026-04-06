import { Hono } from "hono";
import { strictRateLimit, standardRateLimit } from "../middleware/rateLimiter";
import { dashboardAuthMiddleware } from "../middleware/dashboardAuth";
import { nodesApi } from "./nodes";
import { statsApi } from "./stats";
import { authApi } from "./auth";
import { settingsApi } from "./settings";

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
  // KV namespace for instant session blacklist (logout revocation)
  SESSION_BLACKLIST: KVNamespace;
};

const api = new Hono<{ Bindings: Bindings }>();

// Rate-limiting: apply before authentication on selected routes
// Specific routes must come BEFORE wildcard routes (Hono ordering)
api.use("/auth/setup", strictRateLimit);
api.use("/auth/unlock", strictRateLimit);
api.use("/auth/login", strictRateLimit);
api.use("/auth/*", standardRateLimit);
api.use("/nodes", standardRateLimit);
api.use("/stats", standardRateLimit);

// Note: /push route moved to dedicated probe Worker (probe-wrangler.toml)

// 1. Unprotected auth endpoints
api.route("/auth", authApi);

// 2. Protected Dashboard endpoints
const dashboard = new Hono<{ Bindings: Bindings }>();
dashboard.use("*", dashboardAuthMiddleware);
dashboard.route("/nodes", nodesApi);
dashboard.route("/stats", statsApi);
dashboard.route("/settings", settingsApi);
api.route("/", dashboard);

export { api };
