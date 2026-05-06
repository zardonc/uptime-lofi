import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ProbeSetup } from "../../src/components/ProbeSetup";
import { handlers, resetMockApiState } from "../mocks/handlers";

const server = setupServer(...handlers);

describe("ProbeSetup", () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" });
  });

  afterEach(() => {
    server.resetHandlers();
    resetMockApiState();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    server.close();
  });

  it("makes one-command probe installation the primary flow", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });

    render(<ProbeSetup />);

    expect(screen.getByRole("button", { name: "Generate Install Command" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Manual setup" })).not.toBeInTheDocument();
    expect(screen.queryByText("node-secret-generated")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Generate Install Command" }));

    expect(await screen.findByRole("heading", { name: "Run this on your server" })).toBeInTheDocument();
    expect(screen.getByText("This command uses a node-specific credential. It never includes your master API secret.")).toBeInTheDocument();

    const commandBlock = screen.getByTestId("probe-install-command");
    expect(commandBlock).toHaveTextContent("UPTIME_NODE_ID='node-generated-1'");
    expect(commandBlock).toHaveTextContent("UPTIME_NODE_SECRET='node-secret-generated'");
    expect(commandBlock).toHaveTextContent("scripts/install-probe.sh");
    expect(commandBlock).not.toHaveTextContent("API_SECRET_KEY");

    await user.click(screen.getByRole("button", { name: "Copy Command" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("UPTIME_NODE_SECRET='node-secret-generated'"));
    expect(screen.getByText("Command copied")).toBeInTheDocument();
  });

  it("keeps manual config and downloads hidden until requested", async () => {
    const user = userEvent.setup();
    render(<ProbeSetup />);

    await user.click(screen.getByRole("button", { name: "Generate Install Command" }));
    await screen.findByRole("heading", { name: "Run this on your server" });

    expect(screen.queryByRole("heading", { name: "Manual setup" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy Config" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download config.yaml" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show Manual Setup" }));

    const manual = screen.getByRole("region", { name: "Manual setup" });
    expect(within(manual).getByRole("heading", { name: "Manual setup" })).toBeInTheDocument();
    expect(within(manual).getByText("node-generated-1")).toBeInTheDocument();
    expect(within(manual).getByText("node-secret-generated")).toBeInTheDocument();
    expect(within(manual).getByRole("button", { name: "Copy Config" })).toBeInTheDocument();
    expect(within(manual).getByRole("button", { name: "Download config.yaml" })).toBeInTheDocument();
  });
});
