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
    const user = await openMonitorsPage();

    expect(await screen.findByRole("heading", { name: "Monitors" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add Monitor" }));
    const menu = screen.getByRole("menu", { name: "Add monitor options" });
    expect(within(menu).getByRole("menuitem", { name: "Agent Probe" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "HTTP Check" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "TCP Check" })).toBeInTheDocument();
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
    expect(within(card).getByText("Unknown")).toBeInTheDocument();
    expect(within(card).queryByText("Paused")).not.toBeInTheDocument();
    expect(within(card).getAllByText("--").length).toBeGreaterThanOrEqual(2);
    expect(within(card).queryByText("99.9%")).not.toBeInTheDocument();
    expect(within(card).queryByText("42ms")).not.toBeInTheDocument();
  });

  it("shows a visible 403 reachable marker on reachable forbidden HTTP checks", async () => {
    setMockMonitors([{
      id: "monitor-http-403",
      backend_id: "default",
      backend_label: "Default backend",
      backend_type: "cloudflare_worker",
      name: "Forbidden Homepage",
      type: "http",
      status: "online",
      target: { label: "https://example.com/forbidden", url: "https://example.com/forbidden" },
      interval_sec: 300,
      timeout_sec: 10,
      public_visible: true,
      latest: { checked_at: 1_800_000_000, latency_ms: 64, uptime_ratio: 100, cpu_percent: null, mem_percent: null, error_text: null, status_code: 403 },
      visibility: { public: true, show_uptime: true, show_latency: true, show_incidents: true },
      created_at: 1,
      updated_at: 1,
    }]);
    const user = await openMonitorsPage();

    const card = await screen.findByRole("article", { name: "Forbidden Homepage monitor" });
    const marker = within(card).getByLabelText("403 reachable");
    expect(marker).toBeInTheDocument();
    expect(marker).toHaveTextContent("403");
    expect(marker).toHaveAttribute("title", "403 reachable");

    await user.click(within(card).getByRole("button", { name: "Details" }));
    expect(await screen.findByRole("region", { name: "Forbidden Homepage detail" })).toBeInTheDocument();
    expect(screen.getByLabelText("403 reachable")).toHaveAttribute("title", "403 reachable");
  });

  it("distinguishes an empty monitor list from filtered no-match state", async () => {
    const user = await openMonitorsPage();

    await user.type(await screen.findByLabelText("Search monitors"), "not-present");

    expect(await screen.findByRole("heading", { name: "No monitors match" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "No monitors yet" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear Filters" }));

    expect(await screen.findByRole("article", { name: "edge-sfo-1 monitor" })).toBeInTheDocument();
  });

  it("creates HTTP and TCP checks from the Add Monitor flow", async () => {
    setMockMonitors([]);
    const user = await openMonitorsPage();

    await user.click(screen.getByRole("button", { name: "Add Monitor" }));
    await user.click(screen.getByRole("menuitem", { name: "HTTP Check" }));
    let form = await screen.findByRole("form", { name: "Monitor form" });
    await user.type(within(form).getByLabelText("Name"), "Homepage");
    await user.type(within(form).getByLabelText("URL"), "https://example.com/health");
    await user.click(within(form).getByRole("button", { name: "Create Monitor" }));
    expect((await screen.findAllByText("Homepage")).length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole("button", { name: "Add Monitor" }));
    await user.click(screen.getByRole("menuitem", { name: "TCP Check" }));
    form = await screen.findByRole("form", { name: "Monitor form" });
    await user.type(within(form).getByLabelText("Name"), "Postgres");
    await user.type(within(form).getByLabelText("Host"), "db.example.com");
    await user.type(within(form).getByLabelText("Port"), "5432");
    await user.click(within(form).getByRole("button", { name: "Create Monitor" }));
    expect(await screen.findByText("Postgres")).toBeInTheDocument();
    expect(screen.getByText(/db\.example\.com:5432/)).toBeInTheDocument();
  });

  it("creates an Agent Probe and shows the install command in the Add Monitor flow", async () => {
    setMockMonitors([]);
    const user = await openMonitorsPage();

    await user.click(screen.getByRole("button", { name: "Add Monitor" }));
    await user.click(screen.getByRole("menuitem", { name: "Agent Probe" }));
    const form = await screen.findByRole("form", { name: "Monitor form" });

    await user.type(within(form).getByLabelText("Name"), "prod-vps-1");
    await user.selectOptions(within(form).getByLabelText("Platform"), "linux/arm64");
    await user.click(within(form).getByRole("button", { name: "Create Probe & Generate Command" }));

    expect(await screen.findByRole("heading", { name: "Run this on your server" })).toBeInTheDocument();
    const commandBlock = screen.getByTestId("probe-install-command");
    expect(commandBlock).toHaveTextContent("UPTIME_PLATFORM='linux/arm64'");
    expect(commandBlock).toHaveTextContent("UPTIME_MONITOR_ID='monitor-generated-1'");
    expect(commandBlock).toHaveTextContent("UPTIME_MONITOR_SECRET='monitor-secret-generated'");
    expect(commandBlock).not.toHaveTextContent("API_SECRET_KEY");
    expect(await screen.findByRole("article", { name: "prod-vps-1 monitor" })).toBeInTheDocument();
  });

  it("requires confirmation before deleting a monitor", async () => {
    const user = await openMonitorsPage();

    await user.click((await screen.findAllByRole("button", { name: "Delete" }))[0]);

    expect(await screen.findByRole("dialog", { name: "Delete edge-sfo-1?" })).toBeInTheDocument();
    expect(screen.getByText("Historical results stay available for reports. The monitor leaves active management.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep Monitor" }));
    expect(screen.queryByRole("dialog", { name: "Delete edge-sfo-1?" })).not.toBeInTheDocument();
  });

  it("opens a compact edit dialog for monitor settings", async () => {
    const user = await openMonitorsPage();

    await user.click((await screen.findAllByRole("button", { name: "Edit" }))[0]);

    const dialog = await screen.findByRole("dialog", { name: "Edit edge-sfo-1" });
    expect(within(dialog).getByLabelText("Name")).toHaveValue("edge-sfo-1");
    expect(within(dialog).getByLabelText("Interval")).toHaveValue(60);
    expect(within(dialog).getByLabelText("Timeout")).toHaveValue(10);
    expect(within(dialog).getByText("Target and secret-like fields are not edited here.")).toBeInTheDocument();
  });

  it("shows honest no-data detail states instead of synthetic operational data", async () => {
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
    const user = await openMonitorsPage();

    await user.click((await screen.findAllByRole("button", { name: "Details" }))[0]);

    const detail = await screen.findByRole("region", { name: "Homepage detail" });
    expect(within(detail).getByRole("heading", { name: "Homepage" })).toBeInTheDocument();
    expect(within(detail).getByText("Uptime history")).toBeInTheDocument();
    expect(within(detail).getByText("Runtime data")).toBeInTheDocument();
    expect(within(detail).getByText("Recent check results")).toBeInTheDocument();
    expect(within(detail).getByText("No uptime history yet")).toBeInTheDocument();
    expect(within(detail).getByText("No runtime data yet")).toBeInTheDocument();
    expect(within(detail).getByText("No linked alert rules")).toBeInTheDocument();
    expect(within(detail).getByText("No check results yet")).toBeInTheDocument();
    expect(within(detail).queryByText("Synthetic profile")).not.toBeInTheDocument();
    expect(within(detail).queryByText("Telegram + Webhook")).not.toBeInTheDocument();
    expect(within(detail).queryByText("waiting for first check")).not.toBeInTheDocument();
    expect(within(detail).queryByText("Paused")).not.toBeInTheDocument();

    await user.click(within(detail).getByRole("button", { name: "Monitors" }));
    expect(await screen.findByRole("article", { name: "Homepage monitor" })).toBeInTheDocument();
  });
});
