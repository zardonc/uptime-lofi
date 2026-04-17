import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ErrorBanner } from "../../src/components/ErrorBanner";

function DismissibleBanner({ initialMessage }: { readonly initialMessage?: string | null }) {
  const [message, setMessage] = useState(initialMessage);

  if (!message) {
    return null;
  }

  return <ErrorBanner message={message} onRetry={() => setMessage(null)} />;
}

describe("ErrorBanner", () => {
  it("shows the provided error message", () => {
    render(<ErrorBanner message="Overview request failed" />);

    expect(screen.getByText(/overview request failed/i)).toBeInTheDocument();
  });

  it("is hidden when no error is rendered", () => {
    render(<DismissibleBanner initialMessage={null} />);

    expect(screen.queryByText(/overview request failed/i)).not.toBeInTheDocument();
  });

  it("dismisses the banner through user interaction", async () => {
    const user = userEvent.setup();
    render(<DismissibleBanner initialMessage="Overview request failed" />);

    await user.click(screen.getByRole("button", { name: /retry/i }));

    expect(screen.queryByText(/overview request failed/i)).not.toBeInTheDocument();
  });

  it("calls the retry handler when present", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(<ErrorBanner message="Nodes request failed" onRetry={onRetry} />);

    await user.click(screen.getByRole("button", { name: /retry/i }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
