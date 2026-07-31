import { describe, expect, test, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { WorkflowEditor } from "../app/automation/WorkflowEditor";
import type { Automation, Workspace } from "shared";

const { routerMock, fetchJsonMock, refreshMock, workspaceState } = vi.hoisted(() => {
  const workspaceState = { value: null as Workspace | null };
  return {
    routerMock: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() },
    fetchJsonMock: vi.fn(),
    refreshMock: vi.fn().mockResolvedValue(undefined),
    workspaceState,
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("../app/lib/api", () => ({ fetchJson: fetchJsonMock }));

vi.mock("../app/lib/workspace-context", () => ({
  useWorkspace: () => ({
    workspace: workspaceState.value,
    loading: false,
    error: null,
    refresh: refreshMock,
  }),
}));

// Replace the canvas with a lightweight probe so the editor's state machine
// (node selection, config editing, save) is testable without a real layout
// engine. Node clicks are surfaced as buttons named by node id.
vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  const React = await import("react");
  return {
    ...actual,
    useNodesState: (initial: unknown[]) => {
      const [nodes, setNodes] = React.useState(initial);
      return [nodes, setNodes, () => {}];
    },
    useEdgesState: (initial: unknown[]) => {
      const [edges, setEdges] = React.useState(initial);
      return [edges, setEdges, () => {}];
    },
    ReactFlow: ({ nodes, edges, onNodeClick, children }: {
      nodes: Array<{ id: string; data?: { label?: unknown } }>;
      edges: unknown[];
      onNodeClick?: (event: unknown, node: unknown) => void;
      children?: unknown;
    }) => (
      <div data-testid="reactflow" data-nodes={nodes.length} data-edges={edges.length}>
        {nodes.map((node) => (
          <button key={node.id} data-testid={`node-${node.id}`} onClick={(event) => onNodeClick?.(event, node)}>
            {node.data?.label as React.ReactNode}
          </button>
        ))}
        {children as React.ReactNode}
      </div>
    ),
    Controls: () => null,
    Background: () => null,
    MiniMap: () => null,
  };
});

function workspaceFixture(overrides: Partial<Workspace> = {}): Workspace {
  return {
    enterprises: [{ id: "ent-1", name: "启航咨询", tags: [] }],
    users: [],
    projects: [{ id: "proj-1", enterpriseId: "ent-1", name: "增长项目", createdAt: "2026-01-01T00:00:00.000Z" }],
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
    ...overrides,
  };
}

function automationFixture(overrides: Partial<Automation> = {}): Automation {
  return {
    id: "auto-1",
    projectId: "proj-1",
    name: "SLA 护航",
    trigger: "每天9:00",
    triggerType: "schedule",
    action: "创建待办",
    actionType: "notify",
    enabled: true,
    runCount: 0,
    actionInput: {},
    ...overrides,
  } as Automation;
}

describe("WorkflowEditor", () => {
  beforeEach(() => {
    routerMock.push.mockReset();
    routerMock.replace.mockReset();
    fetchJsonMock.mockReset();
    refreshMock.mockReset();
    refreshMock.mockResolvedValue(undefined);
    workspaceState.value = workspaceFixture();
  });

  test("renders the default workflow and selects the first project", () => {
    render(<WorkflowEditor />);
    expect(screen.getByTestId("node-trigger-1")).toBeTruthy();
    expect(screen.getByTestId("node-agent-2")).toBeTruthy();
    expect(screen.getByTestId("node-action-3")).toBeTruthy();
    expect(screen.getByTestId("reactflow").dataset.nodes).toBe("3");
    expect(screen.getByTestId("reactflow").dataset.edges).toBe("2");
    expect((screen.getByDisplayValue("新建工作流") as HTMLInputElement).value).toBe("新建工作流");
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("proj-1");
  });

  test("restores an existing workflow graph in edit mode", () => {
    workspaceState.value = workspaceFixture({
      automations: [
        automationFixture({
          workflowGraph: {
            version: 1,
            nodes: [
              { id: "trigger-7", nodeType: "trigger", position: { x: 10, y: 10 }, config: { triggerType: "schedule", desc: "每天9:00" } },
              { id: "action-8", nodeType: "action", position: { x: 10, y: 200 }, config: { actionType: "notify", pluginId: "plugin-feishu" } },
            ],
            edges: [{ id: "e1", source: "trigger-7", target: "action-8", label: "go" }],
          },
        }),
      ],
    });

    render(<WorkflowEditor id="auto-1" />);
    expect((screen.getByDisplayValue("SLA 护航") as HTMLInputElement).value).toBe("SLA 护航");
    expect(screen.getByTestId("node-trigger-7")).toBeTruthy();
    expect(screen.getByTestId("node-action-8")).toBeTruthy();
    expect(screen.getByTestId("reactflow").dataset.nodes).toBe("2");
    expect(screen.getByTestId("reactflow").dataset.edges).toBe("1");
  });

  test("clicking a node opens its config panel and edits propagate to the node", () => {
    render(<WorkflowEditor />);
    fireEvent.click(screen.getByTestId("node-action-3"));

    const panel = screen.getByText("动作类型").closest("aside");
    expect(panel).toBeTruthy();
    const actionType = within(panel as HTMLElement).getByDisplayValue("选择...");
    fireEvent.change(actionType, { target: { value: "notify" } });

    // The plugin select appears and the changed value is kept.
    expect(within(panel as HTMLElement).getByText("通知插件")).toBeTruthy();
    expect(screen.getByTestId("reactflow").dataset.nodes).toBe("3");
  });

  test("save shows validation messages before any request is made", async () => {
    render(<WorkflowEditor />);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(screen.getByText("请先在插件页绑定飞书/企业微信通知")).toBeTruthy());
    expect(fetchJsonMock).not.toHaveBeenCalled();
  });

  test("save posts the serialized graph and navigates to the new workflow", async () => {
    workspaceState.value = workspaceFixture({
      plugins: [
        { id: "plugin-feishu", name: "飞书", description: "", enabled: true, configRequired: true, configured: true },
      ],
    });
    fetchJsonMock.mockResolvedValue({ id: "auto-new", projectId: "proj-1" });

    render(<WorkflowEditor />);
    fireEvent.click(screen.getByTestId("node-action-3"));
    const panel = screen.getByText("动作类型").closest("aside") as HTMLElement;
    fireEvent.change(within(panel).getByDisplayValue("选择..."), { target: { value: "notify" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(screen.getByText("保存成功")).toBeTruthy());
    expect(fetchJsonMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchJsonMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe("/automations");
    const body = JSON.parse(init.body) as {
      name: string; triggerType: string; actionType: string; actionPluginId: string; workflowGraph: { nodes: unknown[] };
    };
    expect(body.name).toBe("新建工作流");
    expect(body.triggerType).toBe("manual");
    expect(body.actionType).toBe("notify");
    expect(body.actionPluginId).toBe("plugin-feishu");
    expect(body.workflowGraph.nodes).toHaveLength(3);
    expect(routerMock.replace).toHaveBeenCalledWith("/automation/workflow/auto-new");
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  test("delete removes the selected node", () => {
    render(<WorkflowEditor />);
    fireEvent.click(screen.getByTestId("node-action-3"));
    fireEvent.click(screen.getByTitle("删除节点"));
    expect(screen.queryByTestId("node-action-3")).toBeNull();
    expect(screen.getByTestId("reactflow").dataset.nodes).toBe("2");
  });
});
