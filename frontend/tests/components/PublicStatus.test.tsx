import { render, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import App from "../../src/App";
import { handlers, resetMockApiState } from "../mocks/handlers";

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
});
