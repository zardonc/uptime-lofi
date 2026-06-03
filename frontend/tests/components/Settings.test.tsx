import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
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

  it("exposes Public Status visibility controls", async () => {
    setMockAuthState({ isUiLockEnabled: false, authenticated: true });
    renderWithAuth(<Settings />);

    expect(await screen.findByRole("heading", { name: /public status/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/public status enabled/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/private slug/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/uptime/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/latency/i)).toBeInTheDocument();
    expect(screen.getByText("edge-sfo-1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save public status/i })).toBeInTheDocument();
  });

  it("adds Webhook channels without displaying saved secret headers", async () => {
    const user = userEvent.setup();
    setMockAuthState({ isUiLockEnabled: false, authenticated: true });
    renderWithAuth(<Settings />);

    expect(await screen.findByRole("heading", { name: /notification channels/i })).toBeInTheDocument();
    const form = screen.getByRole("form", { name: /notification channel form/i });

    await user.type(within(form).getByLabelText("Name"), "Pager webhook");
    await user.type(within(form).getByLabelText(/webhook url/i), "https://hooks.example.test/pager");
    await user.type(within(form).getByLabelText(/secret header name/i), "x-alert-secret");
    await user.type(within(form).getByLabelText(/secret header value/i), "super-secret-header");
    await user.click(within(form).getByRole("button", { name: /add channel/i }));

    expect(await screen.findByText("Pager webhook")).toBeInTheDocument();
    expect(screen.getByText(/https:\/\/hooks\.example\.test\/pager/i)).toBeInTheDocument();
    expect(screen.queryByText("super-secret-header")).not.toBeInTheDocument();
    expect(screen.getAllByText(/email/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/coming soon/i).length).toBeGreaterThan(0);
  });

  it("adds Telegram channels without displaying saved bot tokens", async () => {
    const user = userEvent.setup();
    setMockAuthState({ isUiLockEnabled: false, authenticated: true });
    renderWithAuth(<Settings />);

    expect(await screen.findByRole("heading", { name: /notification channels/i })).toBeInTheDocument();
    const form = screen.getByRole("form", { name: /notification channel form/i });

    await user.selectOptions(within(form).getByLabelText("Type"), "telegram");
    await user.type(within(form).getByLabelText("Name"), "Pager Telegram");
    await user.type(within(form).getByLabelText(/telegram bot token/i), "123456:telegram-secret");
    await user.type(within(form).getByLabelText(/telegram chat id/i), "-1001234567890");
    await user.click(within(form).getByRole("button", { name: /add channel/i }));

    expect(await screen.findByText("Pager Telegram")).toBeInTheDocument();
    expect(screen.getAllByText(/chat \*\*\*\*7890/i).length).toBeGreaterThan(0);
    expect(screen.queryByText("telegram-secret")).not.toBeInTheDocument();
  });

  it("generates probe installation config", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    setMockAuthState({ isUiLockEnabled: false, authenticated: true });

    renderWithAuth(<Settings />);

    const nameInput = await screen.findByLabelText(/monitor name/i);
    await user.clear(nameInput);
    await user.type(nameInput, "prod-vps-1");
    await user.click(screen.getByRole("button", { name: /generate install command/i }));

    expect(await screen.findByRole("heading", { name: /run this on your server/i })).toBeInTheDocument();
    expect(screen.getByTestId("probe-install-command")).toHaveTextContent("monitor-generated-1");
    expect(screen.queryByText("monitor-secret-generated")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /show manual setup/i }));

    expect(screen.getByText("monitor-generated-1")).toBeInTheDocument();
    expect(screen.getByText("monitor-secret-generated")).toBeInTheDocument();
    expect(screen.getByText("https://uptime-lofi-probe.example.workers.dev/api/push")).toBeInTheDocument();
    expect(screen.getByText("config.yaml")).toBeInTheDocument();
  });
});
