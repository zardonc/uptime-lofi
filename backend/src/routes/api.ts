import { Hono } from "hono";
import { strictRateLimit, standardRateLimit, permissiveRateLimit } from "../middleware/rateLimiter";
import { dashboardAuthMiddleware } from "../middleware/dashboardAuth";
import { probeAuthMiddleware } from "../middleware/auth";
import { pushApi } from "./push";
import { nodesApi } from "./nodes";
import { statsApi } from "./stats";
import { authApi } from "./auth";
import { settingsApi } from "./settings";

// Rate-limiting: apply before authentication on selected routes

export type Bindings = {
  DB: D1Database;
  API_SECRET_KEY: string;
  // Comma-separated list of allowed origins for production CORS
  CORS_ORIGINS?: string;
};

const api = new Hono<{ Bindings: Bindings }>();

// Rate-limiting: apply before authentication on selected routes
api.use("/auth/login", strictRateLimit);
api.use("/auth/*", standardRateLimit);
api.use("/nodes", standardRateLimit);
api.use("/stats", standardRateLimit);
api.use("/push", permissiveRateLimit);

// 1. Unprotected auth endpoints
api.route("/auth", authApi);

// 2. Protected Dashboard endpoints
const dashboard = new Hono<{ Bindings: Bindings }>();
dashboard.use("*", dashboardAuthMiddleware);
dashboard.route("/nodes", nodesApi);
dashboard.route("/stats", statsApi);
dashboard.route("/settings", settingsApi);
api.route("/", dashboard);

// 3. Protected Probe endpoints
const probe = new Hono<{ Bindings: Bindings }>();
probe.use("*", probeAuthMiddleware);
probe.route("/push", pushApi);
api.route("/", probe);

export { api };
