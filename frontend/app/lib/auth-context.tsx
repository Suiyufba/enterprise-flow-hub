"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "shared";
import { AUTH_EXPIRED_EVENT, fetchJson, getStoredToken, getStoredUser, isUnauthorizedError, setStoredUser } from "./api";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  retry: () => Promise<void>;
  login: (username: string, password: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  error: null,
  retry: async () => {},
  login: async () => { throw new Error("AuthContext not ready"); },
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const validateStoredSession = useCallback(async () => {
    const storedUser = getStoredUser();
    const storedToken = getStoredToken();
    if (!storedUser || !storedToken) {
      setStoredUser(null);
      setUser(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { user: validatedUser } = await fetchJson<{ user: User | null }>("/auth/me");
      if (!validatedUser) {
        setStoredUser(null);
        setUser(null);
        return;
      }
      setUser(validatedUser);
      setStoredUser({ ...validatedUser, token: storedToken });
    } catch (sessionError) {
      if (isUnauthorizedError(sessionError)) {
        setStoredUser(null);
        setUser(null);
      } else {
        // Keep the last locally authenticated identity for a retryable outage.
        // Product requests remain protected by the signed bearer token.
        setUser(storedUser as User);
        setError("暂时无法验证登录状态，请检查网络或服务状态后重试");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handleExpired = () => {
      setUser(null);
      setError(null);
      setLoading(false);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    void validateStoredSession();

    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired);
  }, [validateStoredSession]);

  const login = useCallback(async (username: string, password: string) => {
    const u = await fetchJson<User>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setUser(u);
    setStoredUser(u);
    setError(null);
    return u;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setStoredUser(null);
    setError(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, retry: validateStoredSession, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
