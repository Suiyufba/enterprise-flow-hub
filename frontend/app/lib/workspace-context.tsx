"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Workspace } from "shared";
import { fetchJson } from "./api";
import { useAuth } from "./auth-context";

const defaultWorkspace: Workspace = {
  enterprises: [],
  users: [],
  projects: [],
  conversations: [],
  libraryItems: [],
  plugins: [],
  automations: [],
  recentAutomationRuns: [],
  tools: [],
  recentToolRuns: [],
  skills: [],
  personas: [],
  providers: [],
};

interface WorkspaceContextValue {
  workspace: Workspace;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspace: defaultWorkspace,
  loading: true,
  error: null,
  refresh: async () => {},
});

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [workspace, setWorkspace] = useState<Workspace>(defaultWorkspace);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchJson<Workspace>("/workspace");
      setWorkspace(data);
    } catch {
      // Keep the last known state, but never present an outage as legitimate
      // empty business data.
      setError("工作区数据加载失败，请检查网络或服务状态后重试");
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setWorkspace(defaultWorkspace);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [authLoading, refresh, user]);

  return (
    <WorkspaceContext.Provider value={{ workspace, loading, error, refresh }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
