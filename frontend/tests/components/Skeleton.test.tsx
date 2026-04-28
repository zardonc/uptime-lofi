import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton } from "../../src/components/Skeleton";

describe("Skeleton", () => {
  it("renders a loading placeholder", () => {
    render(<Skeleton width="120px" height="16px" />);

    expect(screen.getByLabelText(/loading/i)).toBeInTheDocument();
  });

  it("applies the skeleton animation class", () => {
    render(<Skeleton />);

    expect(screen.getByLabelText(/loading/i)).toHaveClass("skeleton");
  });
});
