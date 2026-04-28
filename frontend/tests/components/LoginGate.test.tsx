import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { describe, beforeAll, afterAll, afterEach, expect, it } from "vitest";
import { AuthProvider } from "../../src/hooks/useAuth";
import { LoginGate } from "../../src/components/LoginGate";
import { handlers, resetMockApiState, setMockAuthState } from "../mocks/handlers";

const server = setupServer(...handlers);

function renderWithAuth(children: ReactNode) {
  return render(<AuthProvider>{children}</AuthProvider>);
}

describe("LoginGate", () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" });
  });

  afterEach(() => {
    server.resetHandlers();
    resetMockApiState();
  });

  afterAll(() => {
    server.close();
  });

  it("shows the login form when unauthenticated", async () => {
    renderWithAuth(
      <LoginGate>
        <div>Protected dashboard</div>
      </LoginGate>,
    );

    expect(await screen.findByRole("form", { name: /login form/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/access key/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /unlock/i })).toBeDisabled();
    expect(screen.queryByText(/protected dashboard/i)).not.toBeInTheDocument();
  });

  it("submits login and renders protected children", async () => {
    const user = userEvent.setup();

    renderWithAuth(
      <LoginGate>
        <div>Protected dashboard</div>
      </LoginGate>,
    );

    const passwordInput = await screen.findByLabelText(/access key/i);
    await user.type(passwordInput, "test-password");
    await user.click(screen.getByRole("button", { name: /unlock/i }));

    expect(await screen.findByText(/protected dashboard/i)).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: /login form/i })).not.toBeInTheDocument();
  });

  it("shows an error when login fails", async () => {
    const user = userEvent.setup();

    renderWithAuth(
      <LoginGate>
        <div>Protected dashboard</div>
      </LoginGate>,
    );

    const passwordInput = await screen.findByLabelText(/access key/i);
    await user.type(passwordInput, "wrong-password");
    await user.click(screen.getByRole("button", { name: /unlock/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid credentials/i);
    expect(screen.queryByText(/protected dashboard/i)).not.toBeInTheDocument();
  });

  it("shows children immediately when refresh resumes an authenticated session", async () => {
    setMockAuthState({ authenticated: true });

    renderWithAuth(
      <LoginGate>
        <div>Protected dashboard</div>
      </LoginGate>,
    );

    await waitFor(() => {
      expect(screen.getByText(/protected dashboard/i)).toBeInTheDocument();
    });

    expect(screen.queryByRole("form", { name: /login form/i })).not.toBeInTheDocument();
  });
});
