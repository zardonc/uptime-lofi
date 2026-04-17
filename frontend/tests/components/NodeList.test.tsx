import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NodeList } from "../../src/components/NodeList";
import type { ApiNode } from "../../src/api/types";

function createNodes(): ReadonlyArray<ApiNode> {
  const now = Math.floor(Date.now() / 1000);

  return [
    {
      id: "node-1",
      name: "edge-sfo-1",
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
      status: "offline",
      last_heartbeat: now - 600,
      ping_ms: null,
      cpu_usage: null,
      mem_usage: null,
      uptime_ratio: 87.2,
      config: null,
    },
  ];
}

describe("NodeList", () => {
  it("renders node rows with their names and metrics", () => {
    const nodes = createNodes();
    render(<NodeList nodes={nodes} />);

    const table = screen.getByRole("table", { name: /list of monitored nodes/i });
    expect(within(table).getByText("edge-sfo-1")).toBeInTheDocument();
    expect(within(table).getByText("edge-fra-1")).toBeInTheDocument();
    expect(within(table).getByText("18ms")).toBeInTheDocument();
  });

  it("shows the empty state when there are no nodes", () => {
    render(<NodeList nodes={[]} />);

    expect(screen.getByText(/no nodes registered yet/i)).toBeInTheDocument();
  });

  it("renders status badges for each row", () => {
    render(<NodeList nodes={createNodes()} />);

    expect(screen.getByText(/online/i)).toHaveClass("status-badge", "badge-online");
    expect(screen.getByText(/offline/i)).toHaveClass("status-badge", "badge-danger");
  });
});
