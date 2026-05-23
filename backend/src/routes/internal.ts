import { Hono } from "hono";
import type { Bindings } from "./api";
import { internalAuthMiddleware } from "../middleware/internalAuth";
import { monitorsApi } from "./monitors";
import { alertsApi } from "./alerts";
import { notificationsApi } from "./notifications";
import { statisticsApi } from "./statistics";

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

internalApi.route("/monitors", monitorsApi);
internalApi.route("/alerts", alertsApi);
internalApi.route("/notifications", notificationsApi);
internalApi.route("/statistics", statisticsApi);

export { internalApi };
