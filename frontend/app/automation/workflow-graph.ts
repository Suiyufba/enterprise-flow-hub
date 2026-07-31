// Pure workflow-graph helpers shared by the WorkflowEditor and its tests.
// Keep this module free of React/JSX so the graph serialization logic can be
// tested without rendering the editor.
import type { Edge, Node } from "@xyflow/react";
import type { WorkflowGraph } from "shared";

const nodeTypes = {
  trigger: { label: "触发器", icon: "automation", color: "#1a2535", border: "#4a90e6" },
  agent: { label: "AI Agent", icon: "spark", color: "#251f30", border: "#b98ed9" },
  condition: { label: "条件判断", icon: "settings", color: "#2a1f14", border: "#fe640b" },
  action: { label: "动作", icon: "settings", color: "#1a2e22", border: "#6ecf8a" },
  loop: { label: "循环", icon: "refresh", color: "#1a1a1a", border: "#8c8c8c" },
};

type NodeType = keyof typeof nodeTypes;

/* ---- helper to create a new node ---- */

let nodeIdCounter = 0;
function newNodeId(type: NodeType) {
  nodeIdCounter += 1;
  return `${type}-${nodeIdCounter}`;
}

function nodeDisplayLabel(type: NodeType, config: Record<string, string>) {
  return config.title || config.desc || nodeTypes[type].label;
}


export {
  nodeTypes,
  newNodeId,
  nodeDisplayLabel,
  collectConfigsByType,
  joinConfigDescriptions,
  serializeWorkflowGraph,
  syncNodeIdCounter,
};
export type { NodeType };

function collectConfigsByType(nodes: Node[], type: NodeType) {
  return nodes
    .filter((node) => node.data?.nodeType === type)
    .map((node) => (node.data.config ?? {}) as Record<string, string>);
}

function joinConfigDescriptions(configs: Record<string, string>[], fallback: string) {
  const text = configs
    .map((config) => config.desc || config.title || "")
    .filter(Boolean)
    .join("；");
  return text || fallback;
}

function serializeWorkflowGraph(nodes: Node[], edges: Edge[]): WorkflowGraph {
  const graphNodes = nodes.flatMap((node) => {
    const nodeType = node.data?.nodeType;
    if (typeof nodeType !== "string" || !(nodeType in nodeTypes)) return [];
    const config = Object.fromEntries(
      Object.entries((node.data.config ?? {}) as Record<string, unknown>)
        .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
    return [{
      id: node.id,
      nodeType: nodeType as NodeType,
      position: { x: node.position.x, y: node.position.y },
      config,
    }];
  });
  const nodeIds = new Set(graphNodes.map((node) => node.id));

  return {
    version: 1,
    nodes: graphNodes,
    edges: edges
      .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
      .map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        ...(typeof edge.label === "string" && edge.label ? { label: edge.label } : {}),
      })),
  };
}

function syncNodeIdCounter(nodes: Node[]) {
  nodeIdCounter = Math.max(0, ...nodes.map((node) => {
    const match = node.id.match(/\d+$/);
    return match ? Number.parseInt(match[0], 10) : 0;
  }));
}
