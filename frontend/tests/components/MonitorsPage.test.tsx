import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import App from "../../src/App";
import { AuthProvider } from "../../src/hooks/useAuth";
import { handlers, resetMockApiState, setMockAuthState, setMockMonitors } from "../mocks/handlers";

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

describe("Monitors page", () => {
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

  it("renders unified monitor management controls", async () => {
    await openMonitorsPage();

    expect(await screen.findByRole("heading", { name: "Monitors" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Monitor" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agent Probe" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "HTTP Check" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "TCP Check" })).toBeInTheDocument();
    expect(screen.getByLabelText("Search monitors")).toBeInTheDocument();
    expect(screen.getByLabelText("Type")).toBeInTheDocument();
    expect(screen.getByLabelText("Status")).toBeInTheDocument();
  });

  it("shows honest no-data metric states instead of fake values", async () => {
    setMockMonitors([{
      id: "monitor-http-1",
      backend_id: "default",
      backend_label: "Default backend",
      backend_type: "cloudflare_worker",
      name: "Homepage",
      type: "http",
      status: "unknown",
      target: { label: "https://example.com/health", url: "https://example.com/health" },
      interval_sec: 300,
      timeout_sec: 10,
      public_visible: true,
      latest: { checked_at: null, latency_ms: null, uptime_ratio: null, cpu_percent: null, mem_percent: null, error_text: null },
      visibility: { public: true, show_uptime: true, show_latency: true, show_incidents: true },
      created_at: 1,
      updated_at: 1,
    }]);

    await openMonitorsPage();

    const card = await screen.findByRole("article", { name: "Homepage monitor" });
    expect(within(card).getByText("No result yet")).toBeInTheDocument();
    expect(within(card).getAllByText("--").length).toBeGreaterThanOrEqual(2);
    expect(within(card).queryByText("99.9%")).not.toBeInTheDocument();
    expect(within(card).queryByText("42ms")).not.toBeInTheDocument();
  });

  it("creates HTTP and TCP checks from the Add Monitor flow", async () => {
    setMockMonitors([]);
    const user = await openMonitorsPage();

    await user.click(screen.getByRole("button", { name: "HTTP Check" }));
    let form = await screen.findByRole("form", { name: "Monitor form" });
    await user.type(within(form).getByLabelText("Name"), "Homepage");
    await user.type(within(form).getByLabelText("URL"), "https://example.com/health");
    await user.click(within(form).getByRole("button", { name: "Create Monitor" }));
    expect((await screen.findAllByText("Homepage")).length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole("button", { name: "TCP Check" }));
    form = await screen.findByRole("form", { name: "Monitor form" });
    await user.type(within(form).getByLabelText("Name"), "Postgres");
    await user.type(within(form).getByLabelText("Host"), "db.example.com");
    await user.type(within(form).getByLabelText("Port"), "5432");
    await user.click(within(form).getByRole("button", { name: "Create Monitor" }));
    expect(await screen.findByText("Postgres")).toBeInTheDocument();
    expect(screen.getByText(/db\.example\.com:5432/)).toBeInTheDocument();
  });

  it("requires confirmation before deleting a monitor", async () => {
    const user = await openMonitorsPage();

    await user.click((await screen.findAllByRole("button", { name: "Delete" }))[0]);

    expect(await screen.findByRole("dialog", { name: "Delete edge-sfo-1?" })).toBeInTheDocument();
    expect(screen.getByText("Historical results stay available for reports. The monitor leaves active management.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep Monitor" }));
    expect(screen.queryByRole("dialog", { name: "Delete edge-sfo-1?" })).not.toBeInTheDocument();
  });
});
