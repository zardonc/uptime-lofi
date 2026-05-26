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

async function openAlertsPage() {
  const user = userEvent.setup();
  setMockAuthState({ authenticated: true });
  renderApp();
  await user.click(await screen.findByRole("button", { name: "Alerts" }));
  return user;
}

describe("Alerts page", () => {
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

  it("renders Rules and History tabs backed by API data", async () => {
    const user = await openAlertsPage();

    expect(await screen.findByRole("heading", { name: "Alerts" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Rules/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /History/ })).toBeInTheDocument();
    expect(await screen.findByRole("article", { name: "Homepage offline alert rule" })).toBeInTheDocument();
    expect(screen.getByText("Ops webhook")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /History/ }));
    expect(await screen.findByRole("table")).toHaveTextContent("Homepage");
    expect(screen.getByRole("table")).toHaveTextContent("pending");
  });

  it("does not offer CPU conditions for HTTP monitors", async () => {
    const user = await openAlertsPage();

    await user.click(screen.getByRole("button", { name: "New Rule" }));
    expect(await screen.findByRole("dialog", { name: "Create alert rule" })).toBeInTheDocument();
    const form = await screen.findByRole("form", { name: "Alert rule form" });
    const monitor = within(form).getByLabelText("Monitor");
    await user.selectOptions(monitor, "monitor-http-1");

    const condition = within(form).getByLabelText("Condition");
    expect(within(condition).queryByRole("option", { name: "CPU" })).not.toBeInTheDocument();
    expect(within(condition).getByRole("option", { name: "HTTP status" })).toBeInTheDocument();
  });

  it("keeps advanced options collapsed by default", async () => {
    const user = await openAlertsPage();

    await user.click(screen.getByRole("button", { name: "New Rule" }));
    expect(await screen.findByRole("dialog", { name: "Create alert rule" })).toBeInTheDocument();
    const form = await screen.findByRole("form", { name: "Alert rule form" });
    const advanced = within(form).getByText("Advanced options").closest("details");

    expect(advanced).not.toHaveAttribute("open");
  });

  it("offers enabled Webhook and Telegram channels and keeps Email unavailable", async () => {
    const user = await openAlertsPage();

    await user.click(screen.getByRole("button", { name: "New Rule" }));
    expect(await screen.findByRole("dialog", { name: "Create alert rule" })).toBeInTheDocument();
    const form = await screen.findByRole("form", { name: "Alert rule form" });

    expect(within(form).getByLabelText(/ops webhook/i)).toBeInTheDocument();
    expect(within(form).getByLabelText(/sre telegram/i)).toBeInTheDocument();
    expect(within(form).getByText(/email/i)).toBeInTheDocument();
    expect(within(form).getByText(/coming soon/i)).toBeInTheDocument();
    expect(within(form).getByLabelText(/email/i)).toBeDisabled();
  });
});
