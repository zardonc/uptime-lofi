import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "../../src/components/StatusBadge";

describe("StatusBadge", () => {
  it("renders online status", () => {
    render(<StatusBadge status="online" />);
    expect(screen.getByText(/online/i)).toBeInTheDocument();
  });

  it("renders offline status", () => {
    render(<StatusBadge status="offline" />);
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
  });

  it("renders unknown status distinctly from paused", () => {
    render(<StatusBadge status="unknown" />);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.queryByText("Paused")).not.toBeInTheDocument();
  });
});
