import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";

export type Bindings = {
  DB: D1Database;
  API_SECRET_KEY: string;
};

const api = new Hono<{ Bindings: Bindings }>();

// All /api/* requests must pass auth verification
api.use("*", authMiddleware);

api.post("/push", async (c) => {
  // Phase 2 placeholder: Here we will parse batch data and batch insert into D1
  const payload = await c.req.json();
  
  // Return the zero-cost trigger structure for OTA capabilities (Phase 5)
  return c.json({ 
    status: "success", 
    control_plane: {
      latest_version: "v1.0.0",
      download_url: "",
      checksum: ""
    }
  });
});

export { api };
