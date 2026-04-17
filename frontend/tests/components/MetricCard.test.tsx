import { render, screen } from "@testing-library/react";
import { Activity } from "lucide-react";
import { describe, expect, it } from "vitest";
import { MetricCard } from "../../src/components/MetricCard";

describe("MetricCard", () => {
  it("renders the label, value, and suffix", () => {
    render(
      <MetricCard
        icon={<Activity aria-hidden="true" />}
        label="Avg Ping"
        value={18}
        suffix="ms"
      />,
    );

    expect(screen.getByRole("region", { name: /avg ping: 18ms/i })).toBeInTheDocument();
    expect(screen.getByText("Avg Ping")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.getByText("ms")).toBeInTheDocument();
  });

  it("renders the configured trend indicator", () => {
    const { container } = render(
      <MetricCard
        icon={<Activity aria-hidden="true" />}
        label="Avg Uptime"
        value="93.55"
        suffix="%"
        trend={{ direction: "up", text: "2.1% from yesterday" }}
      />,
    );

    expect(screen.getByText(/2.1% from yesterday/i)).toBeInTheDocument();
    const trend = container.querySelector(".metric-card__trend");
    expect(trend).toHaveClass("trend--up");
    expect(trend).toHaveTextContent("↑ 2.1% from yesterday");
  });
});
