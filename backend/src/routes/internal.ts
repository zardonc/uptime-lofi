import { Hono } from "hono";
import type { Bindings } from "./api";
import { internalAuthMiddleware } from "../middleware/internalAuth";

const internalApi = new Hono<{ Bindings: Bindings }>();

internalApi.use("*", internalAuthMiddleware);

internalApi.get("/status", (c) => {
  return c.json({
    data: {
      ok: true,
      boundary: "internal-v1",
    },
  });
});

export { internalApi };
