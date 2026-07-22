"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  BackgroundVariant,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./WorkflowEditor.css";
import { fetchJson } from "../lib/api";
import { useWorkspace } from "../lib/workspace-context";
import { AppIcon, type AppIconName } from "../components/AppIcon";
import type { Automation, WorkflowGraph } from "shared";

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

function createNode(type: NodeType, x: number, y: number, config: Record<string, string> = {}, id?: string): Node {
  const def = nodeTypes[type];
  const displayLabel = nodeDisplayLabel(type, config);
  return {
    id: id ?? newNodeId(type),
    type: "default",
    position: { x, y },
    data: {
      label: (
        <div className="wf-node">
          <AppIcon name={def.icon as AppIconName} className="wf-node-icon" />
          <span className="wf-node-type">{def.label}</span>
          <span className="wf-node-label">{displayLabel}</span>
        </div>
      ),
      nodeType: type,
      config,
    },
    style: {
      background: def.color,
      border: `2px solid ${def.border}`,
      borderRadius: 12,
      padding: 0,
      width: 140,
      fontSize: 13,
      color: "#f4f4f4",
    },
  };
}

const initialNodes: Node[] = [
  createNode("trigger", 100, 80),
  createNode("agent", 100, 240),
  createNode("action", 100, 400),
];

const initialEdges: Edge[] = [
  {
    id: "e-t-a",
    source: "trigger-1",
    target: "agent-2",
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: "#666" },
  },
  {
    id: "e-a-ac",
    source: "agent-2",
    target: "action-3",
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: "#666" },
  },
];

const edgeStyle = { stroke: "#666" };

function createEdge(id: string, source: string, target: string, label?: string): Edge {
  return {
    id,
    source,
    target,
    label,
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: edgeStyle,
  };
}

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

/* ---- component ---- */

export function WorkflowEditor({ id: existingId }: { id?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedProjectId = searchParams.get("projectId");

  // Reset counter on mount to avoid stale IDs across page navigations
  useEffect(() => {
    syncNodeIdCounter(initialNodes);
  }, []);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [workflowName, setWorkflowName] = useState(existingId ? "编辑工作流" : "新建工作流");
  const [saving, setSaving] = useState(false);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const loadedAutomationId = useRef<string | null>(null);
  const [savedMessage, setSavedMessage] = useState("");
  const { workspace, refresh: refreshWorkspace } = useWorkspace();
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const configuredProviders = useMemo(
    () => workspace.providers.filter((provider) => provider.enabled && provider.configured),
    [workspace.providers],
  );
  const notificationPlugins = useMemo(
    () => workspace.plugins.filter((plugin) => ["plugin-feishu", "plugin-wecom"].includes(plugin.id)),
    [workspace.plugins],
  );
  const configuredNotificationPlugins = useMemo(
    () => notificationPlugins.filter((plugin) => plugin.enabled && plugin.configured),
    [notificationPlugins],
  );
  const configuredActionTools = useMemo(
    () => workspace.tools.filter((tool) => tool.status === "enabled" && tool.id === "tool-business-action"),
    [workspace.tools],
  );

  useEffect(() => {
    if (existingId) return;
    const requestedProject = workspace.projects.find((project) => project.id === requestedProjectId);
    setSelectedProjectId((current) => current || requestedProject?.id || workspace.projects[0]?.id || "");
  }, [workspace.projects, existingId, requestedProjectId]);

  // Load existing automation data when editing
  useEffect(() => {
    if (!existingId) {
      loadedAutomationId.current = null;
      return;
    }
    if (loadedAutomationId.current === existingId) return;
    const auto = workspace.automations.find((a) => a.id === existingId);
    if (!auto) return;
    loadedAutomationId.current = existingId;
    setWorkflowName(auto.name);
    setSelectedProjectId(auto.projectId);

    if (auto.workflowGraph) {
      const restoredNodes = auto.workflowGraph.nodes.map((node) =>
        createNode(node.nodeType, node.position.x, node.position.y, node.config, node.id),
      );
      const restoredEdges = auto.workflowGraph.edges.map((edge) =>
        createEdge(edge.id, edge.source, edge.target, edge.label),
      );
      syncNodeIdCounter(restoredNodes);
      setNodes(restoredNodes);
      setEdges(restoredEdges);
      setSelectedNode(null);
      return;
    }

    const trigCfg: Record<string, string> = {
      triggerType: auto.triggerType,
      desc: auto.trigger,
    };
    const triggerBinding = auto.actionInput.__efhTrigger;
    if (triggerBinding && typeof triggerBinding === "object" && !Array.isArray(triggerBinding)) {
      const chatIds = (triggerBinding as Record<string, unknown>).chatIds;
      if (Array.isArray(chatIds)) trigCfg.feishuChatId = chatIds.filter((item): item is string => typeof item === "string").join(", ");
    }
    const agentCfg: Record<string, string> = {};
    if (auto.agentModel) agentCfg.model = auto.agentModel;
    if (auto.systemPrompt) agentCfg.prompt = auto.systemPrompt;
    const actionCfg: Record<string, string> = {
      actionType: auto.actionType,
      desc: auto.action,
    };
    if (auto.actionPluginId) actionCfg.pluginId = auto.actionPluginId;
    if (auto.actionToolId) actionCfg.toolId = auto.actionToolId;
    if (Object.keys(auto.actionInput).length > 0) actionCfg.input = JSON.stringify(auto.actionInput, null, 2);

    const hasAgentStep = Boolean(auto.agentModel || auto.systemPrompt || auto.actionType === "call_ai");
    if (hasAgentStep) {
      setNodes([
        createNode("trigger", 100, 80, trigCfg, "trigger-1"),
        createNode("agent", 100, 240, agentCfg, "agent-2"),
        createNode("action", 100, 400, actionCfg, "action-3"),
      ]);
      setEdges([
        createEdge("e-t-a", "trigger-1", "agent-2"),
        createEdge("e-a-ac", "agent-2", "action-3"),
      ]);
    } else {
      setNodes([
        createNode("trigger", 100, 120, trigCfg, "trigger-1"),
        createNode("action", 100, 340, actionCfg, "action-3"),
      ]);
      setEdges([createEdge("e-t-ac", "trigger-1", "action-3")]);
    }
  }, [existingId, workspace.automations, setEdges, setNodes]);

  async function saveWorkflow() {
    if (!workflowName.trim()) {
      setSavedMessage("请输入工作流名称");
      return;
    }
    if (!selectedProjectId) {
      setSavedMessage("请选择工作流所属项目");
      return;
    }
    setSaving(true);
    setSavedMessage("");

    try {
      const triggerConfigs = collectConfigsByType(nodes, "trigger");
      const agentConfigs = collectConfigsByType(nodes, "agent");
      const conditionConfigs = collectConfigsByType(nodes, "condition");
      const loopConfigs = collectConfigsByType(nodes, "loop");
      const actionConfigs = collectConfigsByType(nodes, "action");

      if (triggerConfigs.length === 0 || actionConfigs.length === 0) {
        setSavedMessage("工作流至少需要一个触发器和一个动作节点");
        setSaving(false);
        return;
      }

      const primaryTrigger = triggerConfigs[0] ?? {};
      const primaryAgent = agentConfigs.find((config) => config.model) ?? agentConfigs[0] ?? {};
      const primaryAction = actionConfigs.find((config) => config.actionType) ?? actionConfigs[0] ?? {};
      const resolvedTriggerType = primaryTrigger.triggerType || "manual";
      const resolvedActionType = primaryAction.actionType || "notify";

      if (resolvedTriggerType === "email") {
        setSavedMessage("邮件触发尚未接入，请改用 Webhook 或其他已接通触发器");
        setSaving(false);
        return;
      }
      if (!["notify", "call_ai", "tool_call"].includes(resolvedActionType)) {
        setSavedMessage("旧动作尚未接入，请重新选择通知、AI 或业务工具");
        setSaving(false);
        return;
      }

      const selectedProvider = configuredProviders.find((provider) => provider.id === primaryAgent.model);
      if ((resolvedActionType === "call_ai" || Boolean(primaryAgent.model)) && !selectedProvider) {
        setSavedMessage(configuredProviders.length === 0 ? "请先在设置里配置可用模型账号" : "请选择已配置的模型账号");
        setSaving(false);
        return;
      }

      const selectedNotificationPlugin = configuredNotificationPlugins.find((plugin) => plugin.id === primaryAction.pluginId);
      if (resolvedActionType === "notify" && !selectedNotificationPlugin) {
        setSavedMessage(configuredNotificationPlugins.length === 0 ? "请先在插件页绑定飞书/企业微信通知" : "请选择通知插件");
        setSaving(false);
        return;
      }
      const selectedActionTool = configuredActionTools.find((tool) => tool.id === primaryAction.toolId);
      if (resolvedActionType === "tool_call" && !selectedActionTool) {
        setSavedMessage("请选择一个已启用的业务工具");
        setSaving(false);
        return;
      }
      let actionInput: Record<string, unknown> = {};
      if (resolvedActionType === "tool_call") {
        try {
          actionInput = primaryAction.input?.trim() ? JSON.parse(primaryAction.input) as Record<string, unknown> : {};
        } catch {
          setSavedMessage("工具参数必须是有效的 JSON 对象");
          setSaving(false);
          return;
        }
      }
      const feishuChatIds = (primaryTrigger.feishuChatId ?? "").split(",").map((item) => item.trim()).filter(Boolean);
      if (resolvedTriggerType === "message" && feishuChatIds.length > 0) {
        actionInput.__efhTrigger = { provider: "feishu", chatIds: feishuChatIds };
      }

      const triggerSummary = joinConfigDescriptions(triggerConfigs, "手动触发");
      const actionSummary = joinConfigDescriptions(actionConfigs, "执行动作");
      const agentSummary = agentConfigs
        .map((config) => `${config.title || "AI Agent"}：${config.prompt || "处理任务"}`)
        .join("；");
      const conditionSummary = conditionConfigs
        .map((config) => `${config.title || "条件判断"}：${config.expression || "按规则判断"}`)
        .join("；");
      const loopSummary = loopConfigs
        .map((config) => `${config.title || "循环"}：遍历 ${config.source || "数据列表"}，${config.body || "逐项处理"}`)
        .join("；");
      const promptSummary = [
        primaryAgent.prompt,
        agentSummary && `多模型节点：${agentSummary}`,
        conditionSummary && `条件节点：${conditionSummary}`,
        loopSummary && `循环节点：${loopSummary}`,
      ].filter(Boolean).join(" ");

      const body = {
        projectId: selectedProjectId,
        name: workflowName.trim(),
        trigger: triggerSummary.slice(0, 200),
        triggerType: resolvedTriggerType,
        action: actionSummary.slice(0, 200),
        actionType: resolvedActionType,
        agentModel: primaryAgent.model || "",
        actionPluginId: resolvedActionType === "notify" ? primaryAction.pluginId || "" : "",
        actionToolId: resolvedActionType === "tool_call" ? primaryAction.toolId || "" : "",
        actionInput,
        workflowGraph: serializeWorkflowGraph(nodes, edges),
        systemPrompt: promptSummary.slice(0, 500),
      };

      let savedAutomation: Automation;
      if (existingId) {
        savedAutomation = await fetchJson<Automation>(`/automations/${existingId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        savedAutomation = await fetchJson<Automation>("/automations", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }

      setSavedMessage("保存成功");
      await refreshWorkspace();
      if (!existingId) router.replace(`/automation/workflow/${savedAutomation.id}`);
      setTimeout(() => setSavedMessage(""), 2000);
    } catch (e) {
      setSavedMessage(e instanceof Error ? `保存失败：${e.message.slice(0, 80)}` : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          { ...connection, animated: true, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: "#666" } },
          eds,
        ),
      );
    },
    [setEdges],
  );

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/wf-node-type") as NodeType;
      if (!type || !nodeTypes[type]) return;

      const wrapperBounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!wrapperBounds) return;

      const x = event.clientX - wrapperBounds.left - 75;
      const y = event.clientY - wrapperBounds.top - 25;
      const node = createNode(type, x, y);
      setNodes((nds) => [...nds, node]);
    },
    [setNodes],
  );

  const deleteSelected = useCallback(() => {
    if (!selectedNode) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    setEdges((eds) =>
      eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id),
    );
    setSelectedNode(null);
  }, [selectedNode, setNodes, setEdges]);

  function updateNodeConfig(key: string, value: string) {
    if (!selectedNode) return;
    const updateNode = (node: Node) => {
      const type = node.data?.nodeType as NodeType;
      const config = { ...(node.data.config as Record<string, string>), [key]: value };
      const rendered = createNode(type, node.position.x, node.position.y, config, node.id);
      return { ...node, data: rendered.data, style: rendered.style };
    };
    setNodes((nds) =>
      nds.map((node) => node.id === selectedNode.id ? updateNode(node) : node),
    );
    setSelectedNode((node) => node ? updateNode(node) : null);
  }

  const cfg = (selectedNode?.data.config as Record<string, string>) ?? {};

  const cfgValue = (key: string) => cfg[key] ?? "";

  const nodeTypeOptions = useMemo(
    () =>
      Object.entries(nodeTypes).map(([key, def]) => ({
        key,
        ...def,
      })),
    [],
  );

  return (
    <div className="wf-editor-shell">
      {/* Top bar */}
      <header className="wf-topbar">
        <button className="chat-back" onClick={() => router.push("/automation")} type="button">
          <AppIcon name="arrow-left" />
        </button>
        <select
          className="page-input wf-project-select"
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
        >
          {workspace.projects.map((p) => {
            const ent = workspace.enterprises.find((e) => e.id === p.enterpriseId);
            return <option key={p.id} value={p.id}>{ent?.name ?? ""} / {p.name}</option>;
          })}
        </select>
        <input
          className="wf-title-input"
          value={workflowName}
          onChange={(e) => setWorkflowName(e.target.value)}
        />
        <div className="wf-topbar-actions">
          {savedMessage && <span className="wf-saved-msg">{savedMessage}</span>}
          <button className="page-primary-button" onClick={saveWorkflow} disabled={saving} type="button">
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </header>

      <div className="wf-body">
        {/* Left palette */}
        <aside className="wf-palette">
          <div className="wf-palette-title">节点面板</div>
          <div className="wf-palette-items">
            {nodeTypeOptions.map((opt) => (
              <div
                key={opt.key}
                className="wf-palette-item"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/wf-node-type", opt.key);
                  e.dataTransfer.effectAllowed = "move";
                }}
                style={{ borderColor: opt.border }}
              >
                <AppIcon name={opt.icon as AppIconName} className="wf-palette-icon" />
                <span>{opt.label}</span>
              </div>
            ))}
          </div>
          <div className="wf-palette-hint">拖拽节点到画布上</div>
        </aside>

        {/* Canvas */}
        <div className="wf-canvas" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onDragOver={onDragOver}
            onDrop={onDrop}
            fitView
            deleteKeyCode={["Backspace", "Delete"]}
            multiSelectionKeyCode="Shift"
            fitViewOptions={{ padding: 0.12, maxZoom: 1.2 }}
          >
            <Controls />
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#303030" />
            <MiniMap
              nodeColor={(n) => nodeTypes[n.data?.nodeType as NodeType]?.border ?? "#303030"}
              style={{ background: "#1d1d1d", border: "1px solid #303030" }}
              maskColor="rgba(0,0,0,0.5)"
            />
          </ReactFlow>
        </div>

        {/* Right / Bottom panel */}
        {selectedNode && (
          <aside className="wf-props">
            <div className="wf-props-header">
              <span className="wf-props-title">
                <AppIcon name={nodeTypes[selectedNode.data?.nodeType as NodeType]?.icon as AppIconName} className="wf-props-icon" />{" "}
                {nodeTypes[selectedNode.data?.nodeType as NodeType]?.label}
              </span>
              <button className="wf-props-delete" onClick={deleteSelected} type="button" title="删除节点">
                <AppIcon name="trash" />
              </button>
            </div>
            <div className="wf-props-body">
              {selectedNode.data?.nodeType === "trigger" && (
                <>
                  <label className="wf-props-label">触发类型</label>
                  <select
                    className="page-input wf-props-input"
                    value={cfgValue("triggerType") ?? ""}
                    onChange={(e) => updateNodeConfig("triggerType", e.target.value)}
                  >
                    <option value="">选择...</option>
                    <option value="schedule">定时执行</option>
                    <option value="webhook">Webhook</option>
                    <option value="message">消息触发</option>
                    <option value="email" disabled>邮件事件（未接入）</option>
                    <option value="file">文件事件接入</option>
                    <option value="manual">手动触发</option>
                  </select>
                  {cfgValue("triggerType") === "email" && (
                    <p className="wf-config-warning">邮箱连接器尚未接入，保存后不会自动监听邮箱。建议先使用 Webhook。</p>
                  )}
                  {cfgValue("triggerType") === "file" && (
                    <p className="wf-config-warning">在「文件管理」选择此项目并上传文件后会自动触发。</p>
                  )}
                  {cfgValue("triggerType") === "message" && (
                    <>
                      <label className="wf-props-label">飞书群 Chat ID</label>
                      <input
                        className="page-input wf-props-input"
                        value={cfgValue("feishuChatId") ?? ""}
                        onChange={(e) => updateNodeConfig("feishuChatId", e.target.value)}
                        placeholder="oc_xxx；多个群用逗号分隔"
                      />
                      <p className="wf-config-warning">机器人所在群收到消息后触发；留空则不会接收飞书群消息。</p>
                    </>
                  )}
                  {cfgValue("triggerType") === "webhook" && (
                    <p className="wf-config-warning">保存后可通过 /api/automations/&lt;id&gt;/webhook 触发。</p>
                  )}
                  <label className="wf-props-label">描述</label>
                  <textarea
                    className="page-textarea wf-props-input"
                    rows={2}
                    value={cfgValue("desc") ?? ""}
                    onChange={(e) => updateNodeConfig("desc", e.target.value)}
                    placeholder="如：每天 9:00 执行"
                  />
                </>
              )}
              {selectedNode.data?.nodeType === "agent" && (
                <>
                  <label className="wf-props-label">AI 模型</label>
                  <select
                    className="page-input wf-props-input"
                    value={cfgValue("model") ?? ""}
                    onChange={(e) => updateNodeConfig("model", e.target.value)}
                  >
                    <option value="">选择模型账号...</option>
                    {configuredProviders.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name} / {provider.model}
                      </option>
                    ))}
                    {cfgValue("model") && !workspace.providers.some((provider) => provider.id === cfgValue("model")) && (
                      <option value={cfgValue("model")}>旧模型：{cfgValue("model")}（请重新选择账号）</option>
                    )}
                  </select>
                  {configuredProviders.length === 0 && (
                    <p className="wf-config-warning">暂无可用模型账号。请先在设置 → 模型账号里添加并配置 Key。</p>
                  )}
                  <label className="wf-props-label">System Prompt</label>
                  <textarea
                    className="page-textarea wf-props-input"
                    rows={3}
                    value={cfgValue("prompt") ?? ""}
                    onChange={(e) => updateNodeConfig("prompt", e.target.value)}
                    placeholder="定义 AI 角色和行为..."
                  />
                </>
              )}
              {selectedNode.data?.nodeType === "condition" && (
                <>
                  <label className="wf-props-label">条件表达式</label>
                  <textarea
                    className="page-textarea wf-props-input"
                    rows={2}
                    value={cfgValue("expression") ?? ""}
                    onChange={(e) => updateNodeConfig("expression", e.target.value)}
                    placeholder="如：status === 'overdue'"
                  />
                  <label className="wf-props-label">True 分支描述</label>
                  <input
                    className="page-input wf-props-input"
                    value={cfgValue("trueBranch") ?? ""}
                    onChange={(e) => updateNodeConfig("trueBranch", e.target.value)}
                    placeholder="条件满足时..."
                  />
                  <label className="wf-props-label">False 分支描述</label>
                  <input
                    className="page-input wf-props-input"
                    value={cfgValue("falseBranch") ?? ""}
                    onChange={(e) => updateNodeConfig("falseBranch", e.target.value)}
                    placeholder="条件不满足时..."
                  />
                </>
              )}
              {selectedNode.data?.nodeType === "action" && (
                <>
                  <label className="wf-props-label">动作类型</label>
                  <select
                    className="page-input wf-props-input"
                    value={cfgValue("actionType") ?? ""}
                    onChange={(e) => {
                      updateNodeConfig("actionType", e.target.value);
                      if (e.target.value === "notify" && !cfgValue("pluginId") && configuredNotificationPlugins[0]) {
                        updateNodeConfig("pluginId", configuredNotificationPlugins[0].id);
                      }
                    }}
                  >
                    <option value="">选择...</option>
                    <option value="notify">发送通知</option>
                    <option value="call_ai">调用 AI</option>
                    <option value="tool_call">调用业务工具</option>
                    {cfgValue("actionType") && !["notify", "call_ai", "tool_call"].includes(cfgValue("actionType")) && (
                      <option value={cfgValue("actionType")} disabled>旧动作：{cfgValue("actionType")}（未接入）</option>
                    )}
                  </select>
                  {(cfgValue("actionType") || "notify") === "notify" && (
                    <>
                      <label className="wf-props-label">通知插件</label>
                      <select
                        className="page-input wf-props-input"
                        value={cfgValue("pluginId") ?? ""}
                        onChange={(e) => updateNodeConfig("pluginId", e.target.value)}
                      >
                        <option value="">选择飞书/企业微信...</option>
                        {configuredNotificationPlugins.map((plugin) => (
                          <option key={plugin.id} value={plugin.id}>{plugin.name}</option>
                        ))}
                        {notificationPlugins.filter((plugin) => !plugin.configured || !plugin.enabled).map((plugin) => (
                          <option key={plugin.id} value={plugin.id} disabled>{plugin.name}（待绑定）</option>
                        ))}
                      </select>
                      {configuredNotificationPlugins.length === 0 && (
                        <p className="wf-config-warning">飞书/企业微信通知还没绑定 Webhook，请先到插件页配置后再保存。</p>
                      )}
                    </>
                  )}
                  {cfgValue("actionType") === "tool_call" && (
                    <>
                      <label className="wf-props-label">业务工具</label>
                      <select className="page-input wf-props-input" value={cfgValue("toolId")} onChange={(e) => updateNodeConfig("toolId", e.target.value)}>
                        <option value="">选择业务工具...</option>
                        {configuredActionTools.map((tool) => <option key={tool.id} value={tool.id}>{tool.name}</option>)}
                      </select>
                      <label className="wf-props-label">工具参数 JSON</label>
                      <textarea
                        className="page-textarea wf-props-input"
                        rows={5}
                        value={cfgValue("input")}
                        onChange={(e) => updateNodeConfig("input", e.target.value)}
                        placeholder={'{"operation":"create_task","title":"跟进客户"}'}
                      />
                    </>
                  )}
                  <label className="wf-props-label">描述</label>
                  <textarea
                    className="page-textarea wf-props-input"
                    rows={2}
                    value={cfgValue("desc") ?? ""}
                    onChange={(e) => updateNodeConfig("desc", e.target.value)}
                    placeholder="执行什么动作..."
                  />
                </>
              )}
              {selectedNode.data?.nodeType === "loop" && (
                <>
                  <label className="wf-props-label">遍历数据源</label>
                  <input
                    className="page-input wf-props-input"
                    value={cfgValue("source") ?? ""}
                    onChange={(e) => updateNodeConfig("source", e.target.value)}
                    placeholder="如：线索列表"
                  />
                  <label className="wf-props-label">循环内操作</label>
                  <textarea
                    className="page-textarea wf-props-input"
                    rows={2}
                    value={cfgValue("body") ?? ""}
                    onChange={(e) => updateNodeConfig("body", e.target.value)}
                    placeholder="对每一项执行..."
                  />
                </>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

export default WorkflowEditor;
