// ═══════════════════════════════════════════
// Auth Context — Uptime LoFi Dashboard
// Memory-only JWT + HttpOnly refresh cookie
// ═══════════════════════════════════════════

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { api, setAccessToken, ApiClientError } from '../api/client';

interface AuthState {
  readonly isAuthenticated: boolean;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly hasCheckedSession: boolean;
  readonly login: (password: string) => Promise<void>;
  readonly logout: () => Promise<void>;
  readonly verifySession: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasCheckedSession, setHasCheckedSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const explicitLogoutRef = useRef(false);

  const verifySession = useCallback(async () => {
    try {
      const status = await api.getAuthStatus();
      if (explicitLogoutRef.current) {
        setAccessToken(null);
        setIsAuthenticated(false);
        return;
      }
      if (!status.has_refresh_cookie) {
        setAccessToken(null);
        setIsAuthenticated(Boolean(status.authenticated));
        return;
      }
      const body = await api.refreshSession();
      setAccessToken(body.access_token ?? null);
      setIsAuthenticated(true);
    } catch {
      setAccessToken(null);
      setIsAuthenticated(false);
    } finally {
      setHasCheckedSession(true);
      setIsLoading(false);
    }
  }, []);

  // On mount, attempt a silent refresh to resume an existing session
  useEffect(() => {
    void verifySession();
  }, [verifySession]);

  useEffect(() => {
    const expireSession = () => {
      setAccessToken(null);
      setIsAuthenticated(false);
    };
    window.addEventListener('uptime-lofi:session-expired', expireSession);
    return () => window.removeEventListener('uptime-lofi:session-expired', expireSession);
  }, []);

  useEffect(() => {
    const verifyOnHistoryRestore = () => {
      void verifySession();
    };
    window.addEventListener('pageshow', verifyOnHistoryRestore);
    window.addEventListener('popstate', verifyOnHistoryRestore);
    return () => {
      window.removeEventListener('pageshow', verifyOnHistoryRestore);
      window.removeEventListener('popstate', verifyOnHistoryRestore);
    };
  }, [verifySession]);

  const login = useCallback(async (password: string) => {
    setError(null);
    setIsLoading(true);
    try {
      const result = await api.login(password);
      explicitLogoutRef.current = false;
      setAccessToken(result.access_token ?? null);
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
    explicitLogoutRef.current = true;
    setIsAuthenticated(false);
    try {
      // Call backend to revoke refresh token
      await api.logout();
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
    <AuthContext value={{ isAuthenticated, isLoading, error, hasCheckedSession, login, logout, verifySession }}>
      {children}
    </AuthContext>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
