import { render, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import App from "../../src/App";
import { handlers, resetMockApiState, setMockMonitors } from "../mocks/handlers";
import type { Monitor } from "../../src/api/types";

const server = setupServer(...handlers);

function renderPublicStatus() {
  window.history.pushState({}, "", "/status");
  return render(<App />);
}

describe("Public Status", () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" });
  });

  afterEach(() => {
    window.history.pushState({}, "", "/");
    server.resetHandlers();
    resetMockApiState();
  });

  afterAll(() => {
    server.close();
  });

  it("renders without the admin sidebar", async () => {
    renderPublicStatus();

    expect(await screen.findByRole("heading", { name: "System Status" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dashboard" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Settings" })).not.toBeInTheDocument();
  });

  it("does not check admin auth on the public route", async () => {
    const authStatusRequest = vi.fn();
    server.use(
      http.get("/api/auth/status", () => {
        authStatusRequest();
        return HttpResponse.json({ is_ui_lock_enabled: true, has_refresh_cookie: false });
      }),
    );

    renderPublicStatus();

    expect(await screen.findByRole("heading", { name: "System Status" })).toBeInTheDocument();
    expect(authStatusRequest).not.toHaveBeenCalled();
  });

  it("does not render fields hidden by Public Status settings", async () => {
    renderPublicStatus();

    const card = await screen.findByRole("article", { name: "edge-sfo-1 public monitor" });
    expect(within(card).getByText("Uptime")).toBeInTheDocument();
    expect(within(card).queryByText("Latency")).not.toBeInTheDocument();
  });

  it("renders public unknown monitors without calling them paused", async () => {
    renderPublicStatus();

    const card = await screen.findByRole("article", { name: "Homepage public monitor" });
    expect(within(card).getByText("Unknown")).toBeInTheDocument();
    expect(within(card).queryByText("Paused")).not.toBeInTheDocument();
  });

  it("renders monitors after they are marked public", async () => {
    setMockMonitors([{
      id: "monitor-public-api",
      backend_id: "default",
      backend_label: "Default backend",
      backend_type: "cloudflare_worker",
      name: "Public API",
      type: "http",
      status: "online",
      target: { label: "https://api.example.com", url: "https://api.example.com" },
      interval_sec: 300,
      timeout_sec: 10,
      public_visible: true,
      latest: { checked_at: 1_800_000_000, latency_ms: 88, uptime_ratio: 99.5, cpu_percent: null, mem_percent: null, error_text: null },
      visibility: { public: true, show_uptime: true, show_latency: true, show_incidents: true },
      created_at: 1_800_000_000,
      updated_at: 1_800_000_000,
    } satisfies Monitor]);

    renderPublicStatus();

    const card = await screen.findByRole("article", { name: "Public API public monitor" });
    expect(within(card).getByText("Online")).toBeInTheDocument();
    expect(within(card).getByText("99.50%")).toBeInTheDocument();
  });

  it("shows a 403 reachable marker for public reachable forbidden monitors", async () => {
    setMockMonitors([{
      id: "monitor-public-403",
      backend_id: "default",
      backend_label: "Default backend",
      backend_type: "cloudflare_worker",
      name: "Forbidden Public API",
      type: "http",
      status: "online",
      target: { label: "https://api.example.com/forbidden", url: "https://api.example.com/forbidden" },
      interval_sec: 300,
      timeout_sec: 10,
      public_visible: true,
      latest: { checked_at: 1_800_000_000, latency_ms: 88, uptime_ratio: 99.5, cpu_percent: null, mem_percent: null, error_text: null, status_code: 403 },
      visibility: { public: true, show_uptime: true, show_latency: true, show_incidents: true },
      created_at: 1_800_000_000,
      updated_at: 1_800_000_000,
    } satisfies Monitor]);

    renderPublicStatus();

    const card = await screen.findByRole("article", { name: "Forbidden Public API public monitor" });
    const marker = within(card).getByLabelText("403 reachable");
    expect(marker).toHaveTextContent("403");
    expect(marker).toHaveAttribute("title", "403 reachable");
  });
});
