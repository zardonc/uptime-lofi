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

async function openAgentlessPage() {
  const user = userEvent.setup();
  setMockAuthState({ authenticated: true });
  renderApp();
  await user.click(await screen.findByRole("button", { name: "Agentless" }));
  return user;
}

describe("Agentless page", () => {
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

  it("shows the backend-scheduled Agentless configuration surface", async () => {
    await openAgentlessPage();

    expect(await screen.findByRole("heading", { name: "Agentless" })).toBeInTheDocument();
    expect(screen.getByText("Configure HTTP and TCP checks that run from the backend scheduler")).toBeInTheDocument();
    expect(screen.getByText(/Checks run from backend\/Worker scheduled execution, not from the browser\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "HTTP Checks" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "TCP Checks" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByText("No synthetic checks yet")).toBeInTheDocument();
  });

  it("renders the minimum HTTP check fields and submit CTA", async () => {
    await openAgentlessPage();

    const form = await screen.findByRole("form", { name: "HTTP check form" });

    expect(within(form).getByLabelText("Check name")).toHaveAttribute("placeholder", "Homepage");
    expect(within(form).getByLabelText("URL")).toHaveAttribute("placeholder", "https://example.com/health");
    expect(within(form).getByLabelText("Interval")).toBeInTheDocument();
    expect(within(form).getByText("How often the backend should run this check.")).toBeInTheDocument();
    expect(within(form).getByLabelText("Timeout")).toBeInTheDocument();
    expect(within(form).getByText("How long to wait before marking the check failed.")).toBeInTheDocument();
    expect(within(form).getByLabelText("Expected status")).toHaveValue(200);
    expect(within(form).getByRole("button", { name: "Create HTTP Check" })).toBeInTheDocument();
  });

  it("renders the minimum TCP check fields and submit CTA", async () => {
    const user = await openAgentlessPage();

    await user.click(screen.getByRole("button", { name: "TCP Checks" }));
    const form = await screen.findByRole("form", { name: "TCP check form" });

    expect(screen.getByText("TCP checks run from the backend scheduler. Private, localhost, and Cloudflare-blocked targets are rejected before storage.")).toBeInTheDocument();
    expect(within(form).getByLabelText("Check name")).toHaveAttribute("placeholder", "Postgres");
    expect(within(form).getByLabelText("Host")).toHaveAttribute("placeholder", "db.example.com");
    expect(within(form).getByLabelText("Port")).toHaveAttribute("placeholder", "5432");
    expect(within(form).getByLabelText("Timeout")).toBeInTheDocument();
    expect(within(form).getByLabelText("Interval")).toBeInTheDocument();
    expect(within(form).getByRole("button", { name: "Create TCP Check" })).toBeEnabled();
  });

  it("creates a TCP check through the backend API", async () => {
    const user = await openAgentlessPage();

    await user.click(screen.getByRole("button", { name: "TCP Checks" }));
    const form = await screen.findByRole("form", { name: "TCP check form" });
    await user.type(within(form).getByLabelText("Check name"), "Postgres");
    await user.type(within(form).getByLabelText("Host"), "db.example.com");
    await user.type(within(form).getByLabelText("Port"), "5432");
    await user.click(within(form).getByRole("button", { name: "Create TCP Check" }));

    expect(await screen.findByText("Postgres")).toBeInTheDocument();
    expect(screen.getByText("db.example.com:5432")).toBeInTheDocument();
  });
});
