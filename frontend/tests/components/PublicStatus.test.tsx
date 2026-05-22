import { render, screen, within } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import App from "../../src/App";
import { AuthProvider } from "../../src/hooks/useAuth";
import { handlers, resetMockApiState } from "../mocks/handlers";

const server = setupServer(...handlers);

function renderPublicStatus() {
  window.history.pushState({}, "", "/status");
  return render(
    <AuthProvider>
      <App />
    </AuthProvider>,
  );
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

  it("does not render fields hidden by Public Status settings", async () => {
    renderPublicStatus();

    const card = await screen.findByRole("article", { name: "edge-sfo-1 public monitor" });
    expect(within(card).getByText("Uptime")).toBeInTheDocument();
    expect(within(card).queryByText("Latency")).not.toBeInTheDocument();
  });
});
