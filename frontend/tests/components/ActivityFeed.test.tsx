import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActivityFeed } from "../../src/components/ActivityFeed";
import type { ActivityEvent } from "../../src/components/ActivityFeed";

function createEvents(): ReadonlyArray<ActivityEvent> {
  return [
    {
      id: "evt-1",
      timestamp: "5 minutes ago",
      type: "online",
      node: "edge-sfo-1",
      message: "Node reporting normally",
    },
    {
      id: "evt-2",
      timestamp: "2 hours ago",
      type: "warning",
      node: "edge-fra-1",
      message: "Packet loss above threshold",
    },
  ];
}

describe("ActivityFeed", () => {
  it("renders activity events", () => {
    render(<ActivityFeed events={[...createEvents()]} />);

    expect(screen.getByText("edge-sfo-1")).toBeInTheDocument();
    expect(screen.getByText("Node reporting normally")).toBeInTheDocument();
    expect(screen.getByText("Packet loss above threshold")).toBeInTheDocument();
  });

  it("renders an empty list when no events are available", () => {
    render(<ActivityFeed events={[]} />);

    expect(screen.getByRole("list", { name: /activity events/i })).toBeInTheDocument();
    expect(screen.queryByText(/packet loss above threshold/i)).not.toBeInTheDocument();
  });

  it("shows human-readable timestamps", () => {
    render(<ActivityFeed events={[...createEvents()]} />);

    expect(screen.getByText("5 minutes ago")).toBeInTheDocument();
    expect(screen.getByText("2 hours ago")).toBeInTheDocument();
  });
});
