import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NodeList } from "../../src/components/NodeList";
import type { ApiMetric, ApiNode } from "../../src/api/types";

const server = setupServer();

function createNodes(): ReadonlyArray<ApiNode> {
  const now = Math.floor(Date.now() / 1000);

  return [
    {
      id: "node-1",
      name: "edge-sfo-1",
      type: "agent_push",
      status: "online",
      last_heartbeat: now - 30,
      ping_ms: 18,
      cpu_usage: 24,
      mem_usage: 58,
      uptime_ratio: 99.9,
      config: null,
    },
    {
      id: "node-2",
      name: "edge-fra-1",
      type: "agentless_http",
      status: "offline",
      last_heartbeat: now - 600,
      ping_ms: null,
      cpu_usage: null,
      mem_usage: null,
      uptime_ratio: 87.2,
      config: {
        url: "https://example.com/health",
        interval: 300,
        timeout: 10,
        expected_status: 200,
      },
    },
  ];
}

function createMetrics(): ReadonlyArray<ApiMetric> {
  const now = Math.floor(Date.now() / 1000);

  return [
    {
      id: 1,
      node_id: "node-1",
      timestamp: now - 30,
      cpu_percent: 31,
      mem_percent: 63,
      ping_ms: 16,
      containers: [
        {
          id: "container-1",
          name: "uptime-api",
          image: "uptime-lofi:latest",
          state: "running",
          status: "Up 4 minutes",
          cpu_percent: null,
          mem_percent: null,
        },
      ],
    },
  ];
}

describe("NodeList", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });
  afterAll(() => server.close());

  it("renders node cards with names, actions, and metric labels", () => {
    const nodes = createNodes();
    render(<NodeList nodes={nodes} />);

    const region = screen.getByRole("region", { name: "Monitored nodes" });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(within(region).getByText("edge-sfo-1")).toBeInTheDocument();
    expect(within(region).getByText("Agent Probe")).toBeInTheDocument();
    expect(within(region).getByLabelText("Ping: 18 milliseconds")).toHaveTextContent("18ms");
    expect(within(region).getByLabelText("CPU usage: 24 percent")).toHaveTextContent("24.0%");
    expect(within(region).getByLabelText("Memory usage: 58 percent")).toHaveTextContent("58.0%");
    expect(within(region).getAllByRole("button", { name: "Edit" })).toHaveLength(2);
    expect(within(region).getAllByRole("button", { name: "View Details" })).toHaveLength(2);
    expect(within(region).getAllByRole("button", { name: "More actions" })).toHaveLength(2);
  });

  it("shows the empty state when there are no nodes", () => {
    render(<NodeList nodes={[]} />);

    expect(screen.getByText("No nodes yet")).toBeInTheDocument();
    expect(screen.getByText("Add an agent probe or create an agentless check to start monitoring.")).toBeInTheDocument();
  });

  it("renders missing metrics as muted no-data values", () => {
    render(<NodeList nodes={createNodes()} />);

    expect(screen.getByLabelText("Ping: no data yet")).toHaveTextContent("--");
    expect(screen.getByLabelText("CPU usage: no data yet")).toHaveTextContent("--");
    expect(screen.getByLabelText("Memory usage: no data yet")).toHaveTextContent("--");
  });

  it("keeps delete behind the menu and opens a custom confirmation", async () => {
    const user = userEvent.setup();
    render(<NodeList nodes={createNodes()} />);

    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "More actions" })[0]);
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));

    const dialog = screen.getByRole("dialog", { name: "Delete edge-sfo-1?" });
    expect(within(dialog).getByText("Historical metrics will be preserved if the backend supports archive mode. This removes the node from active monitoring.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Keep Node" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Delete Node" })).toBeInTheDocument();
  });

  it("opens a detail drawer with real Docker metrics when available", async () => {
    const user = userEvent.setup();
    server.use(http.get("/api/nodes/node-1/metrics", () => HttpResponse.json({ data: createMetrics() })));

    render(<NodeList nodes={createNodes()} />);

    await user.click(screen.getAllByRole("button", { name: "View Details" })[0]);

    const drawer = await screen.findByRole("dialog", { name: /edge-sfo-1 details/i });
    expect(within(drawer).getByRole("button", { name: "Close details" })).toBeInTheDocument();
    expect(within(drawer).getByText("Current metrics")).toBeInTheDocument();
    expect(within(drawer).getByText("Configuration summary")).toBeInTheDocument();
    expect(within(drawer).getByText("Docker containers")).toBeInTheDocument();
    expect(within(drawer).getByText("uptime-api")).toBeInTheDocument();
    expect(within(drawer).getByText("uptime-lofi:latest")).toBeInTheDocument();
  });

  it("submits safe node edits and refreshes the list", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    server.use(http.put("/api/nodes/node-1", async ({ request }) => {
      const body = await request.json() as { name?: string };
      return HttpResponse.json({ data: { ...createNodes()[0], name: body.name } });
    }));

    render(<NodeList nodes={createNodes()} onRefresh={onRefresh} />);

    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Edit edge-sfo-1" });
    await user.clear(within(dialog).getByLabelText("Node name"));
    await user.type(within(dialog).getByLabelText("Node name"), "edge-sfo-renamed");
    await user.click(within(dialog).getByRole("button", { name: "Save Node" }));

    expect(onRefresh).toHaveBeenCalled();
  });

  it("edits safe Agentless HTTP config fields", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    let requestBody: unknown;
    server.use(http.put("/api/nodes/node-2", async ({ request }) => {
      requestBody = await request.json();
      return HttpResponse.json({ data: { ...createNodes()[1], ...(requestBody as object) } });
    }));

    render(<NodeList nodes={createNodes()} onRefresh={onRefresh} />);

    await user.click(screen.getAllByRole("button", { name: "Edit" })[1]);
    const dialog = screen.getByRole("dialog", { name: "Edit edge-fra-1" });
    await user.clear(within(dialog).getByLabelText("Interval"));
    await user.type(within(dialog).getByLabelText("Interval"), "600");
    await user.clear(within(dialog).getByLabelText("Timeout"));
    await user.type(within(dialog).getByLabelText("Timeout"), "12");
    await user.click(within(dialog).getByRole("button", { name: "Save Node" }));

    expect(requestBody).toMatchObject({
      name: "edge-fra-1",
      config: {
        url: "https://example.com/health",
        interval: 600,
        timeout: 12,
        expected_status: 200,
      },
    });
    expect(onRefresh).toHaveBeenCalled();
  });

  it("shows honest Docker no-data copy in the detail drawer", async () => {
    const user = userEvent.setup();
    server.use(http.get("/api/nodes/node-2/metrics", () => HttpResponse.json({ data: [] })));

    render(<NodeList nodes={createNodes()} />);

    await user.click(screen.getAllByRole("button", { name: "View Details" })[1]);

    const drawer = await screen.findByRole("dialog", { name: /edge-fra-1 details/i });
    expect(within(drawer).getByText("No container data yet")).toBeInTheDocument();
    expect(within(drawer).getByText("Docker data is not available from this node yet.")).toBeInTheDocument();
  });
});
