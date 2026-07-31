import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { WorkspaceProvider, useWorkspace } from "../app/lib/workspace-context";
import type { Workspace } from "shared";

const { authState, fetchJsonMock } = vi.hoisted(() => {
  const authState = { user: null as { id: string; enterpriseId: string; username: string; displayName: string; role: "admin" | "member"; createdAt: string } | null, loading: false };
  const fetchJsonMock = vi.fn();
  return { authState, fetchJsonMock };
});

vi.mock("../app/lib/auth-context", () => ({
  useAuth: () => authState,
}));

vi.mock("../app/lib/api", () => ({
  fetchJson: fetchJsonMock,
}));

const sampleWorkspace: Workspace = {
  enterprises: [{ id: "ent-1", name: "启航咨询", tags: [] }],
  users: [],
  projects: [{ id: "proj-1", enterpriseId: "ent-1", name: "增长项目", createdAt: "" }],
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

function Probe() {
  const { workspace, loading, error, refresh } = useWorkspace();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="error">{error ?? ""}</span>
      <span data-testid="enterprises">{workspace.enterprises.map((e) => e.name).join(",")}</span>
      <button onClick={() => void refresh()}>refresh</button>
    </div>
  );
}

describe("WorkspaceProvider", () => {
  beforeEach(() => {
    authState.user = null;
    authState.loading = false;
    fetchJsonMock.mockReset();
  });

  test("loads workspace once the authenticated user is known", async () => {
    authState.user = { id: "u1", enterpriseId: "ent-1", username: "alice", displayName: "Alice", role: "admin", createdAt: "" };
    fetchJsonMock.mockResolvedValue(sampleWorkspace);

    render(
      <WorkspaceProvider>
        <Probe />
      </WorkspaceProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("enterprises").textContent).toBe("启航咨询"));
    expect(fetchJsonMock).toHaveBeenCalledTimes(1);
    expect(fetchJsonMock).toHaveBeenCalledWith("/workspace");
    expect(screen.getByTestId("loading").textContent).toBe("false");
    expect(screen.getByTestId("error").textContent).toBe("");
  });

  test("does not fetch without a user and resets to the default workspace", async () => {
    render(
      <WorkspaceProvider>
        <Probe />
      </WorkspaceProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(fetchJsonMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("enterprises").textContent).toBe("");
  });

  test("keeps last known data and surfaces an error when refresh fails", async () => {
    authState.user = { id: "u1", enterpriseId: "ent-1", username: "alice", displayName: "Alice", role: "member", createdAt: "" };
    fetchJsonMock.mockResolvedValueOnce(sampleWorkspace).mockRejectedValueOnce(new Error("network down"));

    render(
      <WorkspaceProvider>
        <Probe />
      </WorkspaceProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("enterprises").textContent).toBe("启航咨询"));

    await screen.getByRole("button", { name: "refresh" }).click();
    await waitFor(() => expect(screen.getByTestId("error").textContent).toBe("工作区数据加载失败，请检查网络或服务状态后重试"));
    // Data from the last successful load must survive the failed refresh.
    expect(screen.getByTestId("enterprises").textContent).toBe("启航咨询");
    expect(fetchJsonMock).toHaveBeenCalledTimes(2);
  });
});
