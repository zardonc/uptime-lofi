// ═══════════════════════════════════════════
// Auth Context — Uptime LoFi Dashboard
// Memory-only JWT + HttpOnly refresh cookie
// ═══════════════════════════════════════════

import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { api, setAccessToken, getAccessToken, ApiClientError } from '../api/client';

interface AuthState {
  readonly isAuthenticated: boolean;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly login: (password: string) => Promise<void>;
  readonly logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // On mount, attempt a silent refresh to resume an existing session
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const body = await api.refreshSession();
        if (!cancelled) {
          setAccessToken(body.access_token);
          setIsAuthenticated(true);
        }
      } catch {
        // No session — that's fine, user will see login
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (password: string) => {
    setError(null);
    setIsLoading(true);
    try {
      const result = await api.login(password);
      setAccessToken(result.access_token);
      setIsAuthenticated(true);
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Login failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    const token = getAccessToken();
    try {
      // Call backend to revoke refresh token
      if (token) await api.logout();
    } catch (error) {
      // Log but don't fail - token will expire anyway
      console.warn('Logout API call failed:', error);
    } finally {
      // Clear local state regardless of API success
      setAccessToken(null);
      setIsAuthenticated(false);
    }
  }, []);

  return (
    <AuthContext value={{ isAuthenticated, isLoading, error, login, logout }}>
      {children}
    </AuthContext>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
