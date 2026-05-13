import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
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

  it("keeps a created HTTP check visible when the follow-up reload fails", async () => {
    let listCalls = 0;
    server.use(
      http.get("/api/agentless", () => {
        listCalls += 1;
        if (listCalls > 1) return HttpResponse.json({ error: "Session expired" }, { status: 401 });
        return HttpResponse.json({ data: [] });
      }),
    );
    const user = await openAgentlessPage();

    const form = await screen.findByRole("form", { name: "HTTP check form" });
    await user.type(within(form).getByLabelText("Check name"), "Homepage");
    await user.type(within(form).getByLabelText("URL"), "https://example.com/health");
    await user.click(within(form).getByRole("button", { name: "Create HTTP Check" }));

    expect(await screen.findByText("Homepage")).toBeInTheDocument();
    expect(screen.queryByText("Could not save this check. Review the fields and try again.")).not.toBeInTheDocument();
  });

  it("polls for scheduled Agentless results after creation", async () => {
    const user = userEvent.setup();
    let listCalls = 0;
    server.use(
      http.get("/api/agentless", () => {
        listCalls += 1;
        if (listCalls === 1) return HttpResponse.json({ data: [] });
        return HttpResponse.json({
          data: [{
            id: "agentless-http-1",
            name: "Homepage",
            type: "agentless_http",
            status: "online",
            target: "https://example.com/health",
            latest_result: { timestamp: Math.floor(Date.now() / 1000), is_up: true, latency_ms: 42, error_text: null },
          }],
        });
      }),
    );

    setMockAuthState({ authenticated: true });
    renderApp();
    await user.click(await screen.findByRole("button", { name: "Agentless" }));
    expect(await screen.findByText("No synthetic checks yet")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "TCP Checks" }));
    await user.click(screen.getByRole("button", { name: "HTTP Checks" }));

    expect(await screen.findByText("Homepage")).toBeInTheDocument();
    expect(screen.getByText("Reachable")).toBeInTheDocument();
    expect(screen.getByText("42ms")).toBeInTheDocument();
  });
});
