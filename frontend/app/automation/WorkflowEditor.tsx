"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
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
import type { Automation } from "shared";

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

function buildComplexScenarioGraph(providerId?: string): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [
    createNode("trigger", 20, 60, {
      title: "Webhook/企微/邮件",
      triggerType: "webhook",
      desc: "官网表单、企微消息、邮件、CRM 新客、付款回调、投诉工单",
    }, "trigger-intake"),
    createNode("trigger", 20, 210, {
      title: "文件上传",
      triggerType: "file",
      desc: "合同、报价单、聊天截图、客户 Excel、发票附件",
    }, "trigger-file"),
    createNode("trigger", 20, 360, {
      title: "定时/人工扫描",
      triggerType: "schedule",
      desc: "每 30 分钟扫描 SLA，也支持人工触发巡检",
    }, "trigger-schedule"),
    createNode("agent", 190, 210, {
      title: "轻量分类模型",
      model: providerId ?? "",
      prompt: "去重、分类、风险分级，输出事件类型、难度等级、下一节点和 SLA。",
    }, "agent-router"),
    createNode("condition", 360, 210, {
      title: "风险/难度判断",
      expression: "risk in P0/P1 OR taskDifficulty === 'complex'",
      trueBranch: "进入深度推理和主管升级",
      falseBranch: "进入资料补全或普通日报",
    }, "condition-risk"),
    createNode("agent", 530, 60, {
      title: "OCR/表格模型",
      model: providerId ?? "",
      prompt: "从截图、合同、报价单、Excel 中提取客户、金额、付款、合同截止日和缺失字段。",
    }, "agent-ocr"),
    createNode("agent", 530, 210, {
      title: "深度推理模型",
      model: providerId ?? "",
      prompt: "综合客户价值、投诉、退款、合同临期、付款异常和顾问负载，给出决策路径。",
    }, "agent-reasoning"),
    createNode("loop", 700, 210, {
      title: "逐客户循环",
      source: "P0/P1 客户、逾期报价、合同临期、付款异常清单",
      body: "逐条生成责任人、下一步、截止时间、升级条件和写回字段。",
    }, "loop-customers"),
    createNode("condition", 700, 360, {
      title: "是否需要后台核验",
      expression: "missingEvidence OR noApiSystemRequired",
      trueBranch: "浏览器巡检 CRM/付款/合同后台",
      falseBranch: "直接通知闭环",
    }, "condition-browser"),
    createNode("action", 870, 210, {
      title: "浏览器巡检",
      actionType: "browser",
      desc: "只读打开 CRM、付款、合同后台，核验未分配、逾期、付款失败和重复客户。",
    }, "action-browser"),
    createNode("action", 870, 360, {
      title: "HTTP 推送/写回",
      actionType: "api_call",
      desc: "HTTP POST 推送飞书/企微/老板看板，并写回风险、责任人、截止时间。",
    }, "action-push"),
    createNode("condition", 870, 510, {
      title: "去重与升级策略",
      expression: "sameRiskWithin2h ? skipNotify : notifyNow",
      trueBranch: "跳过重复通知，只更新看板",
      falseBranch: "P0 立即推送，普通事件进日报",
    }, "condition-dedupe"),
  ];

  const edges: Edge[] = [
    createEdge("e-intake-router", "trigger-intake", "agent-router"),
    createEdge("e-file-ocr", "trigger-file", "agent-ocr"),
    createEdge("e-schedule-router", "trigger-schedule", "agent-router"),
    createEdge("e-router-risk", "agent-router", "condition-risk"),
    createEdge("e-risk-ocr", "condition-risk", "agent-ocr", "资料缺口"),
    createEdge("e-risk-reasoning", "condition-risk", "agent-reasoning", "高风险/复杂"),
    createEdge("e-ocr-reasoning", "agent-ocr", "agent-reasoning"),
    createEdge("e-reasoning-loop", "agent-reasoning", "loop-customers"),
    createEdge("e-loop-browser-check", "loop-customers", "condition-browser"),
    createEdge("e-browser-action", "condition-browser", "action-browser", "需要核验"),
    createEdge("e-browser-push", "action-browser", "action-push"),
    createEdge("e-no-browser-push", "condition-browser", "action-push", "证据完整"),
    createEdge("e-push-dedupe", "action-push", "condition-dedupe"),
    createEdge("e-dedupe-loop", "condition-dedupe", "loop-customers", "继续下一客户"),
  ];

  return { nodes, edges };
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

/* ---- component ---- */

export function WorkflowEditor({ id: existingId }: { id?: string }) {
  const router = useRouter();

  // Reset counter on mount to avoid stale IDs across page navigations
  useEffect(() => {
    const maxId = Math.max(0, ...initialNodes.map((n) => {
      const match = n.id.match(/\d+$/);
      return match ? parseInt(match[0], 10) : 0;
    }));
    nodeIdCounter = maxId;
  }, []);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [workflowName, setWorkflowName] = useState(existingId ? "编辑工作流" : "新建工作流");
  const [saving, setSaving] = useState(false);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (workspace.projects[0] && !existingId) setSelectedProjectId(workspace.projects[0].id);
  }, [workspace.projects, existingId]);

  // Load existing automation data when editing
  useEffect(() => {
    if (!existingId) return;
    const auto = workspace.automations.find((a) => a.id === existingId);
    if (!auto) return;
    setWorkflowName(auto.name);
    setSelectedProjectId(auto.projectId);

    if (auto.name.includes("复杂综合任务")) {
      const { nodes: complexNodes, edges: complexEdges } = buildComplexScenarioGraph(auto.agentModel);
      const triggerNode = complexNodes.find((node) => node.id === "trigger-intake");
      const pushNode = complexNodes.find((node) => node.id === "action-push");
      const reasoningNode = complexNodes.find((node) => node.id === "agent-reasoning");
      if (triggerNode) {
        triggerNode.data = {
          ...triggerNode.data,
          config: {
            ...triggerNode.data.config as Record<string, string>,
            triggerType: auto.triggerType,
            desc: auto.trigger,
          },
        };
      }
      if (pushNode) {
        pushNode.data = {
          ...pushNode.data,
          config: {
            ...pushNode.data.config as Record<string, string>,
            actionType: auto.actionType,
            desc: auto.action,
            pluginId: auto.actionPluginId ?? "",
          },
        };
      }
      if (reasoningNode) {
        reasoningNode.data = {
          ...reasoningNode.data,
          config: {
            ...reasoningNode.data.config as Record<string, string>,
            model: auto.agentModel ?? "",
            prompt: auto.systemPrompt ?? "",
          },
        };
      }
      setNodes(complexNodes);
      setEdges(complexEdges);
      return;
    }

    const trigCfg: Record<string, string> = {
      triggerType: auto.triggerType,
      desc: auto.trigger,
    };
    const agentCfg: Record<string, string> = {};
    if (auto.agentModel) agentCfg.model = auto.agentModel;
    if (auto.systemPrompt) agentCfg.prompt = auto.systemPrompt;
    const actionCfg: Record<string, string> = {
      actionType: auto.actionType,
      desc: auto.action,
    };
    if (auto.actionPluginId) actionCfg.pluginId = auto.actionPluginId;

    setNodes([
      createNode("trigger", 100, 80, trigCfg, "trigger-1"),
      createNode("agent", 100, 240, agentCfg, "agent-2"),
      createNode("action", 100, 400, actionCfg, "action-3"),
    ]);
  }, [existingId, workspace.automations, setEdges, setNodes]);

  async function saveWorkflow() {
    if (!workflowName.trim()) return;
    setSaving(true);
    setSavedMessage("");

    try {
      const triggerConfigs = collectConfigsByType(nodes, "trigger");
      const agentConfigs = collectConfigsByType(nodes, "agent");
      const conditionConfigs = collectConfigsByType(nodes, "condition");
      const loopConfigs = collectConfigsByType(nodes, "loop");
      const actionConfigs = collectConfigsByType(nodes, "action");

      const primaryTrigger = triggerConfigs[0] ?? {};
      const primaryAgent = agentConfigs.find((config) => config.model) ?? agentConfigs[0] ?? {};
      const primaryAction = actionConfigs.find((config) => config.actionType) ?? actionConfigs[0] ?? {};

      const selectedProvider = configuredProviders.find((provider) => provider.id === primaryAgent.model);
      if (agentConfigs.length > 0 && !selectedProvider) {
        setSavedMessage(configuredProviders.length === 0 ? "请先在设置里配置可用模型账号" : "请选择已配置的模型账号");
        setSaving(false);
        return;
      }

      const resolvedActionType = primaryAction.actionType || "notify";
      const selectedNotificationPlugin = configuredNotificationPlugins.find((plugin) => plugin.id === primaryAction.pluginId);
      if (resolvedActionType === "notify" && !selectedNotificationPlugin) {
        setSavedMessage(configuredNotificationPlugins.length === 0 ? "请先在插件页绑定飞书/企业微信通知" : "请选择通知插件");
        setSaving(false);
        return;
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
        triggerType: primaryTrigger.triggerType || "manual",
        action: actionSummary.slice(0, 200),
        actionType: resolvedActionType,
        agentModel: primaryAgent.model || undefined,
        actionPluginId: resolvedActionType === "notify" ? primaryAction.pluginId || undefined : undefined,
        systemPrompt: promptSummary.slice(0, 500) || undefined,
      };

      if (existingId) {
        await fetchJson(`/automations/${existingId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await fetchJson<Automation>("/automations", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }

      setSavedMessage("保存成功");
      await refreshWorkspace();
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
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selectedNode.id
          ? { ...n, data: { ...n.data, config: { ...(n.data.config as Record<string, string>), [key]: value } } }
          : n,
      ),
    );
    setSelectedNode((n) =>
      n ? { ...n, data: { ...n.data, config: { ...(n.data.config as Record<string, string>), [key]: value } } } : null,
    );
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
          ←
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
            fitViewOptions={{ padding: 0.12, maxZoom: workflowName.includes("复杂综合任务") ? 0.7 : 1.2 }}
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
                ×
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
                    <option value="email">邮件事件接入</option>
                    <option value="file">文件事件接入</option>
                    <option value="manual">手动触发</option>
                  </select>
                  {["email", "file"].includes(cfgValue("triggerType") ?? "") && (
                    <p className="wf-config-warning">这个触发器需要外部系统调用事件接口；当前不会自动监听邮箱或服务器文件夹。</p>
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
                    <option value="send_email">发送邮件</option>
                    <option value="api_call">API 调用</option>
                    <option value="shell">Shell 命令</option>
                    <option value="browser">浏览器操作</option>
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
