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
  refresh: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspace: defaultWorkspace,
  loading: true,
  refresh: async () => {},
});

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [workspace, setWorkspace] = useState<Workspace>(defaultWorkspace);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchJson<Workspace>("/workspace");
      setWorkspace(data);
    } catch {
      // keep last known state — UI shows stale data rather than blank
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setWorkspace(defaultWorkspace);
      setLoading(false);
      return;
    }
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [authLoading, refresh, user]);

  return (
    <WorkspaceContext.Provider value={{ workspace, loading, refresh }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
