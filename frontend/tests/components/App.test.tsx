import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import App from "../../src/App";
import { handlers, resetMockApiState, setMockAuthState, setMockStatistics } from "../mocks/handlers";

const server = setupServer(...handlers);

function renderApp() {
  return render(<App />);
}

describe("App navigation", () => {
  const originalPath = window.location.pathname;

  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" });
  });

  afterEach(() => {
    window.history.pushState({}, "", originalPath);
    server.resetHandlers();
    resetMockApiState();
  });

  afterAll(() => {
    server.close();
  });

  it("switches main content when v2 sidebar items are clicked", async () => {
    const user = userEvent.setup();
    setMockAuthState({ authenticated: true });

    renderApp();

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Monitors" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agentless" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nodes" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Monitors" }));

    expect(await screen.findByRole("heading", { name: "Monitors" })).toBeInTheDocument();
    expect(screen.getByText("Unified management for agent probes, HTTP checks, and TCP checks")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Monitor" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Dashboard" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Statistics" }));

    expect(await screen.findByRole("heading", { name: "Statistics" })).toBeInTheDocument();
  });

  it("requests v2 dashboard APIs and exposes logout", async () => {
    const user = userEvent.setup();
    const monitorsRequest = vi.fn();
    const summaryRequest = vi.fn();
    setMockAuthState({ authenticated: true });
    server.use(
      http.get("/api/v1/monitors", () => {
        monitorsRequest();
        return HttpResponse.json({ data: [] });
      }),
      http.get("/api/v1/statistics/summary", () => {
        summaryRequest();
        return HttpResponse.json({
          data: {
            backend_id: "default",
            backend_label: "Default backend",
            backend_type: "cloudflare_worker",
            range: "24h",
            generated_at: Math.floor(Date.now() / 1000),
            total_monitors: 0,
            online_monitors: 0,
            incident_count: 0,
            total_downtime_sec: 0,
            avg_latency_ms: null,
            uptime_ratio: null,
          },
        });
      }),
    );

    renderApp();

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(await screen.findByText("No monitors configured")).toBeInTheDocument();
    expect(monitorsRequest).toHaveBeenCalled();
    expect(summaryRequest).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Refresh/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Logout" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Refresh/i }));
    await user.click(screen.getByRole("button", { name: "Logout" }));

    expect(await screen.findByRole("button", { name: "Unlock" })).toBeInTheDocument();
  });

  it("uses the v2 monitor list for dashboard monitor count when rollups are empty", async () => {
    setMockAuthState({ authenticated: true });
    setMockStatistics({
      summary: {
        backend_id: "default",
        backend_label: "Default backend",
        backend_type: "cloudflare_worker",
        range: "24h",
        generated_at: Math.floor(Date.now() / 1000),
        total_monitors: 0,
        online_monitors: 0,
        incident_count: 0,
        total_downtime_sec: 0,
        avg_latency_ms: null,
        uptime_ratio: null,
      },
    });

    renderApp();

    expect(await screen.findByRole("region", { name: "Monitors: 2" })).toBeInTheDocument();
    expect(await screen.findByText("2 configured")).toBeInTheDocument();
  });

  it("renders public status without the admin sidebar", async () => {
    window.history.pushState({}, "", "/status");
    setMockAuthState({ authenticated: true });

    renderApp();

    expect(await screen.findByRole("heading", { name: "System Status" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Main navigation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dashboard" })).not.toBeInTheDocument();
  });
});
