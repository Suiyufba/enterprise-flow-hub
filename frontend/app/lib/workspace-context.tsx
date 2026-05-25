"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Workspace } from "shared";
import { fetchJson } from "./api";

const defaultWorkspace: Workspace = {
  enterprises: [],
  users: [],
  projects: [],
  conversations: [],
  libraryItems: [],
  plugins: [],
  automations: [],
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
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  return (
    <WorkspaceContext.Provider value={{ workspace, loading, refresh }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
