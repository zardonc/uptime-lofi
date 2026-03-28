import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { pushApi } from "./push";
import { nodesApi } from "./nodes";
import { statsApi } from "./stats";

export type Bindings = {
  DB: D1Database;
  API_SECRET_KEY: string;
};

const api = new Hono<{ Bindings: Bindings }>();

// All /api/* requests must pass auth verification
api.use("*", authMiddleware);

api.route("/push", pushApi);
api.route("/nodes", nodesApi);
api.route("/stats", statsApi);

export { api };
