import { render, screen, within } from "@testing-library/react";
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

async function openMonitorsPage() {
  const user = userEvent.setup();
  setMockAuthState({ authenticated: true });
  renderApp();
  await user.click(await screen.findByRole("button", { name: "Monitors" }));
  return user;
}

describe("Agentless legacy shell removal", () => {
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

  it("does not expose Agentless as a top-level navigation item", async () => {
    setMockAuthState({ authenticated: true });
    renderApp();

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agentless" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Monitors" })).toBeInTheDocument();
  });

  it("keeps HTTP and TCP creation modes under Monitors", async () => {
    const user = await openMonitorsPage();

    expect(await screen.findByRole("heading", { name: "Monitors" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "HTTP Check" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "TCP Check" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "HTTP Check" }));
    let form = await screen.findByRole("form", { name: "Monitor form" });
    expect(within(form).getByLabelText("URL")).toHaveAttribute("placeholder", "https://example.com/health");
    expect(within(form).getByLabelText("Expected status")).toHaveValue(200);

    await user.click(screen.getByRole("button", { name: "TCP Check" }));
    form = await screen.findByRole("form", { name: "Monitor form" });
    expect(within(form).getByLabelText("Host")).toHaveAttribute("placeholder", "db.example.com");
    expect(within(form).getByLabelText("Port")).toHaveAttribute("placeholder", "5432");
  });
});
