import { http, HttpResponse } from "msw";

export const handlers = [
  http.get("/api/stats/overview", () => {
    return HttpResponse.json({
      totalNodes: 4,
      onlineNodes: 2,
      offlineNodes: 1,
      unknownNodes: 1,
      avgUptime: 98.5,
    });
  }),
  http.post("/api/auth/login", async ({ request }) => {
    const body = await request.json() as { password: string };
    if (body.password === "test-password") {
      return HttpResponse.json({ token: "fake-jwt-token", refreshToken: "fake-refresh-token" });
    }
    return HttpResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }),
  http.post("/api/auth/status", () => {
    return HttpResponse.json({ authenticated: false });
  }),
];
