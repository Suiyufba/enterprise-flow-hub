"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "shared";
import { fetchJson, getStoredUser, setStoredUser } from "./api";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: async () => { throw new Error("AuthContext not ready"); },
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUser(getStoredUser());
    setLoading(false);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const u = await fetchJson<User>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setUser(u);
    setStoredUser(u);
    return u;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setStoredUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
