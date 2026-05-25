import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "../../src/components/Sidebar";

describe("Sidebar", () => {
  it("renders the main navigation items", () => {
    render(<Sidebar activeId="dashboard" onNavigate={vi.fn()} />);

    expect(screen.getByRole("button", { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /monitors/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /nodes/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /agentless/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
  });

  it("toggles the collapsed state", async () => {
    const user = userEvent.setup();
    render(<Sidebar activeId="dashboard" onNavigate={vi.fn()} />);

    const sidebar = screen.getByRole("navigation", { name: /main navigation/i });
    expect(sidebar).not.toHaveClass("sidebar--collapsed");

    await user.click(screen.getByRole("button", { name: /collapse/i }));

    expect(sidebar).toHaveClass("sidebar--collapsed");
    expect(screen.getByRole("button", { name: /dashboard/i })).toHaveAttribute("title", "Dashboard");
    expect(screen.getByRole("button", { name: /expand/i })).toBeInTheDocument();
  });

  it("marks the active item and triggers navigation", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    render(<Sidebar activeId="monitors" onNavigate={onNavigate} />);

    const monitorsButton = screen.getByRole("button", { name: /monitors/i });
    expect(monitorsButton).toHaveAttribute("aria-current", "page");

    await user.click(screen.getByRole("button", { name: /settings/i }));

    expect(onNavigate).toHaveBeenCalledWith("settings");
  });
});
