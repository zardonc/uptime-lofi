import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import App from "../../src/App";
import { AuthProvider } from "../../src/hooks/useAuth";
import { handlers, resetMockApiState, setMockAuthState } from "../mocks/handlers";

const server = setupServer(...handlers);

function renderApp() {
  return render(
    <AuthProvider>
      <App />
    </AuthProvider>,
  );
}

describe("App navigation", () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" });
  });

  afterEach(() => {
    server.resetHandlers();
    resetMockApiState();
  });

  afterAll(() => {
    server.close();
  });

  it("switches main content when sidebar items are clicked", async () => {
    const user = userEvent.setup();
    setMockAuthState({ authenticated: true });

    renderApp();

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Nodes" }));

    expect(await screen.findByRole("heading", { name: "Nodes" })).toBeInTheDocument();
    expect(screen.getByText("Manage agent probes and synthetic checks")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Node" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Dashboard" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Agentless" }));

    expect(await screen.findByRole("heading", { name: "Agentless" })).toBeInTheDocument();
    expect(screen.getByText("Configure HTTP and TCP checks that run from the backend scheduler")).toBeInTheDocument();
  });

  it("opens the Nodes Add Node chooser and switches between setup paths", async () => {
    const user = userEvent.setup();
    setMockAuthState({ authenticated: true });

    renderApp();

    await user.click(await screen.findByRole("button", { name: "Nodes" }));
    await user.click(await screen.findByRole("button", { name: "Add Node" }));

    expect(screen.getByRole("heading", { name: "Agent Probe" })).toBeInTheDocument();
    expect(screen.getByText("Install a small probe on a server to report CPU, memory, ping, Docker containers, and heartbeat.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Agent Probe" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Agentless Check" })).toBeInTheDocument();
    expect(screen.getByText("Monitor an HTTP URL or TCP endpoint from the backend scheduler.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Agentless Check" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add Agent Probe" }));
    expect(screen.getByRole("button", { name: "Generate Install Command" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add Node" }));
    await user.click(screen.getByRole("button", { name: "Add Agentless Check" }));

    expect(await screen.findByRole("heading", { name: "Agentless" })).toBeInTheDocument();
  });
});
