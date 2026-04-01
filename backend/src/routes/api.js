import { Hono } from "hono";
import { strictRateLimit, standardRateLimit, permissiveRateLimit } from "../middleware/rateLimiter";
import { dashboardAuthMiddleware } from "../middleware/dashboardAuth";
import { probeAuthMiddleware } from "../middleware/auth";
import { pushApi } from "./push";
import { nodesApi } from "./nodes";
import { statsApi } from "./stats";
import { authApi } from "./auth";
import { settingsApi } from "./settings";
const api = new Hono();
// Rate-limiting: apply before authentication on selected routes
api.use("/auth/login", strictRateLimit);
api.use("/auth/*", standardRateLimit);
api.use("/nodes", standardRateLimit);
api.use("/stats", standardRateLimit);
api.use("/push", permissiveRateLimit);
// 1. Unprotected auth endpoints
api.route("/auth", authApi);
// 2. Protected Dashboard endpoints
const dashboard = new Hono();
dashboard.use("*", dashboardAuthMiddleware);
dashboard.route("/nodes", nodesApi);
dashboard.route("/stats", statsApi);
dashboard.route("/settings", settingsApi);
api.route("/", dashboard);
// 3. Protected Probe endpoints
const probe = new Hono();
probe.use("*", probeAuthMiddleware);
probe.route("/push", pushApi);
api.route("/", probe);
export { api };
