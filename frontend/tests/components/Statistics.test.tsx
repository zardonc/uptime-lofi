import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import App from "../../src/App";
import { AuthProvider } from "../../src/hooks/useAuth";
import { handlers, resetMockApiState, setMockAuthState, setMockStatistics } from "../mocks/handlers";

const server = setupServer(...handlers);

function renderApp() {
  return render(
    <AuthProvider>
      <App />
    </AuthProvider>,
  );
}

async function openStatisticsPage() {
  const user = userEvent.setup();
  setMockAuthState({ authenticated: true });
  renderApp();
  await user.click(await screen.findByRole("button", { name: "Statistics" }));
  return user;
}

describe("Statistics page", () => {
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

  it("renders summary metrics and leaderboards from API fixtures", async () => {
    await openStatisticsPage();

    expect(await screen.findByRole("heading", { name: "Statistics" })).toBeInTheDocument();
    expect(screen.getByText("98.75")).toBeInTheDocument();
    expect(screen.getAllByText("1h 30m").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("640ms")).toBeInTheDocument();
    expect(screen.getByText("78%")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Downtime leaderboard" })).toHaveTextContent("Homepage");
  });

  it("shows no-data states when statistics are empty", async () => {
    const now = Math.floor(Date.now() / 1000);
    setMockStatistics({
      summary: {
        backend_id: "default",
        backend_label: "Default backend",
        backend_type: "cloudflare_worker",
        range: "7d",
        generated_at: now,
        total_monitors: 0,
        online_monitors: 0,
        incident_count: 0,
        total_downtime_sec: 0,
        avg_latency_ms: null,
        uptime_ratio: null,
      },
      leaderboards: {
        backend_id: "default",
        backend_label: "Default backend",
        backend_type: "cloudflare_worker",
        range: "7d",
        generated_at: now,
        downtime: [],
        slowest: [],
        resource_heavy: [],
      },
      trends: {
        backend_id: "default",
        backend_label: "Default backend",
        backend_type: "cloudflare_worker",
        range: "7d",
        generated_at: now,
        availability: [],
        system_load: [],
      },
    });

    await openStatisticsPage();

    expect(await screen.findAllByText("--")).toHaveLength(2);
    expect(screen.getByText("No downtime recorded for this period.")).toBeInTheDocument();
    expect(screen.getByText("No latency samples recorded for this period.")).toBeInTheDocument();
    expect(screen.getByText("No availability trend yet")).toBeInTheDocument();
  });

  it("shows resource no-data when no agent metrics exist", async () => {
    setMockStatistics({
      leaderboards: {
        ...resetlessStatistics().leaderboards,
        resource_heavy: [],
      },
    });

    await openStatisticsPage();

    const resource = await screen.findByRole("article", { name: "Resource load leaderboard" });
    expect(within(resource).getByText("No agent resource metrics recorded for this period.")).toBeInTheDocument();
  });
});

function resetlessStatistics() {
  const now = Math.floor(Date.now() / 1000);
  return {
    leaderboards: {
      backend_id: "default" as const,
      backend_label: "Default backend",
      backend_type: "cloudflare_worker" as const,
      range: "7d" as const,
      generated_at: now,
      downtime: [],
      slowest: [],
      resource_heavy: [],
    },
  };
}
