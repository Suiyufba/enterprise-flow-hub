import { describe, expect, test } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import {
  collectConfigsByType,
  joinConfigDescriptions,
  nodeDisplayLabel,
  newNodeId,
  serializeWorkflowGraph,
  syncNodeIdCounter,
} from "../app/automation/workflow-graph";

function node(id: string, nodeType: string, config: Record<string, string> = {}): Node {
  return {
    id,
    type: "default",
    position: { x: 10, y: 20 },
    data: { nodeType, config },
  } as unknown as Node;
}

describe("newNodeId / syncNodeIdCounter", () => {
  test("generates incrementing ids per type", () => {
    syncNodeIdCounter([]);
    expect(newNodeId("trigger")).toBe("trigger-1");
    expect(newNodeId("action")).toBe("action-2");
  });

  test("resumes the counter from existing node ids", () => {
    syncNodeIdCounter([node("trigger-7", "trigger")]);
    expect(newNodeId("trigger")).toBe("trigger-8");
  });
});

describe("nodeDisplayLabel", () => {
  test("prefers title, then desc, then the built-in label", () => {
    expect(nodeDisplayLabel("agent", { title: "评审 Agent" })).toBe("评审 Agent");
    expect(nodeDisplayLabel("agent", { desc: "每日评审" })).toBe("每日评审");
    expect(nodeDisplayLabel("agent", {})).toBe("AI Agent");
  });
});

describe("collectConfigsByType / joinConfigDescriptions", () => {
  test("collects only matching node types", () => {
    const nodes = [
      node("trigger-1", "trigger", { title: "定时触发" }),
      node("agent-1", "agent", { desc: "分析" }),
      node("action-1", "action", {}),
    ];
    expect(collectConfigsByType(nodes, "trigger")).toEqual([{ title: "定时触发" }]);
    expect(collectConfigsByType(nodes, "agent")).toHaveLength(1);
    expect(collectConfigsByType(nodes, "loop")).toEqual([]);
  });

  test("joins descriptions and falls back when empty", () => {
    expect(joinConfigDescriptions([{ desc: "A" }, { title: "B" }, { title: "C", desc: "D" }], "fallback")).toBe("A；B；D");
    expect(joinConfigDescriptions([{ title: "" }, {}], "fallback")).toBe("fallback");
  });
});

describe("serializeWorkflowGraph", () => {
  test("serializes valid nodes and drops dangling edges", () => {
    const nodes = [
      node("trigger-1", "trigger", { title: "定时" }),
      node("agent-2", "agent", { desc: "分析" }),
      node("bad-node", "unknown-type", {}),
    ];
    const edges: Edge[] = [
      { id: "e1", source: "trigger-1", target: "agent-2", label: "go" },
      { id: "e2", source: "trigger-1", target: "missing", label: "dangling" },
      { id: "e3", source: "bad-node", target: "agent-2" },
    ];
    const graph = serializeWorkflowGraph(nodes, edges);

    expect(graph.version).toBe(1);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes.map((n) => n.id)).toEqual(["trigger-1", "agent-2"]);
    expect(graph.nodes[0].config).toEqual({ title: "定时" });
    expect(graph.edges).toEqual([{ id: "e1", source: "trigger-1", target: "agent-2", label: "go" }]);
  });

  test("strips non-string config values and empty labels", () => {
    const nodes = [
      { ...node("trigger-1", "trigger", { title: "定时" }), data: { nodeType: "trigger", config: { title: "定时", count: 42, nested: { a: 1 } } } },
    ];
    const edges: Edge[] = [{ id: "e1", source: "trigger-1", target: "trigger-1", label: "" }];
    const graph = serializeWorkflowGraph(nodes, edges);
    expect(graph.nodes[0].config).toEqual({ title: "定时" });
    expect(graph.edges[0]).not.toHaveProperty("label");
  });
});
