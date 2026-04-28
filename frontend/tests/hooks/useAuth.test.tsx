import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { setupServer } from "msw/node";
import { describe, beforeAll, afterAll, afterEach, expect, it } from "vitest";
import { AuthProvider, useAuth } from "../../src/hooks/useAuth";
import { ApiClientError, getAccessToken, setAccessToken } from "../../src/api/client";
import { handlers, resetMockApiState, setMockAuthState } from "../mocks/handlers";

const server = setupServer(...handlers);

function wrapper({ children }: { readonly children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe("useAuth", () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" });
  });

  afterEach(() => {
    server.resetHandlers();
    resetMockApiState();
    setAccessToken(null);
  });

  afterAll(() => {
    server.close();
  });

  it("starts unauthenticated when silent refresh fails", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.error).toBeNull();
    expect(getAccessToken()).toBeNull();
  });

  it("logs in successfully and stores the access token", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.login("test-password");
    });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    expect(result.current.error).toBeNull();
    expect(getAccessToken()).toBe("test-access-token");
  });

  it("surfaces an API error when login fails", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await expect(result.current.login("wrong-password")).rejects.toBeInstanceOf(ApiClientError);
    });

    await waitFor(() => {
      expect(result.current.error).toBe("Invalid credentials");
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(getAccessToken()).toBeNull();
  });

  it("logs out and clears the local session", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.login("test-password");
    });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(getAccessToken()).toBeNull();
  });

  it("resumes an existing session by refreshing and replacing a stale token", async () => {
    setAccessToken("stale-token");
    setMockAuthState({
      authenticated: true,
      accessToken: "refreshed-access-token",
      refreshToken: "rotated-refresh-token",
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.error).toBeNull();
    expect(getAccessToken()).toBe("refreshed-access-token");
  });
});
