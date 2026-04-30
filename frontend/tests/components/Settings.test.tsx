import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../src/hooks/useAuth";
import { Settings } from "../../src/components/Settings";
import { handlers, resetMockApiState, setFailSettingsUpdate, setMockAuthState } from "../mocks/handlers";

const server = setupServer(...handlers);

function renderWithAuth(children: ReactNode) {
  return render(<AuthProvider>{children}</AuthProvider>);
}

describe("Settings", () => {
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

  it("loads current settings and pre-fills the lock toggle", async () => {
    setMockAuthState({ isUiLockEnabled: true, authenticated: true });
    renderWithAuth(<Settings />);

    const checkbox = await screen.findByRole("checkbox", { name: /ui access lock/i });
    expect(checkbox).toBeChecked();
    expect(screen.getByLabelText(/custom password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
  });

  it("validates password input before save", async () => {
    const user = userEvent.setup();
    setMockAuthState({ isUiLockEnabled: true, authenticated: true });
    renderWithAuth(<Settings />);

    const passwordInput = await screen.findByLabelText(/custom password/i);
    await user.type(passwordInput, "short");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText(/password must be at least 8 characters/i)).toBeInTheDocument();
  });

  it("saves valid settings and shows success feedback", async () => {
    const user = userEvent.setup();
    const logoutSpy = vi.spyOn(window, "setTimeout");
    setMockAuthState({ isUiLockEnabled: true, authenticated: true });

    renderWithAuth(<Settings />);

    const passwordInput = await screen.findByLabelText(/custom password/i);
    await user.type(passwordInput, "secure-pass-1");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText(/settings saved successfully/i)).toBeInTheDocument();
    expect(logoutSpy).toHaveBeenCalled();
  });

  it("shows an API error when saving fails", async () => {
    const user = userEvent.setup();
    setFailSettingsUpdate(true);
    setMockAuthState({ isUiLockEnabled: true, authenticated: true });
    renderWithAuth(<Settings />);

    const passwordInput = await screen.findByLabelText(/custom password/i);
    await user.type(passwordInput, "secure-pass-1");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText(/failed to save settings/i)).toBeInTheDocument();
  });

  it("generates probe installation config", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    setMockAuthState({ isUiLockEnabled: false, authenticated: true });

    renderWithAuth(<Settings />);

    const nameInput = await screen.findByLabelText(/node name/i);
    await user.clear(nameInput);
    await user.type(nameInput, "prod-vps-1");
    await user.click(screen.getByRole("button", { name: /generate probe config/i }));

    expect(await screen.findByText("node-generated-1")).toBeInTheDocument();
    expect(screen.getByText("node-secret-generated")).toBeInTheDocument();
    expect(screen.getByText("https://uptime-lofi-probe.example.workers.dev")).toBeInTheDocument();
    expect(screen.getByText("config.yaml")).toBeInTheDocument();
  });
});
