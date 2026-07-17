"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { AgentPlanStep, ConversationDetail, Message, ToolRun, Workspace } from "shared";
import { fetchJson, getStoredToken } from "../../lib/api";
import { connectSSE } from "../../lib/sse";
import { useToast } from "../../lib/toast-context";
import MarkdownMessage from "../../components/MarkdownMessage";
import { TypingIndicator } from "../../components/TypingIndicator";
import { ErrorState } from "../../components/ErrorState";
import { AgentRunPanel } from "../../components/AgentRunPanel";
import { gsap, useGSAP } from "../../lib/gsap";

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTag, setEditingTag] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [personaId, setPersonaId] = useState("");
  const [contextScope, setContextScope] = useState<"current_project" | "selected_projects">("current_project");
  const [contextEnterpriseId, setContextEnterpriseId] = useState("");
  const [contextProjectIds, setContextProjectIds] = useState<string[]>([]);
  const [runPlan, setRunPlan] = useState<AgentPlanStep[]>([]);
  const [runTools, setRunTools] = useState<ToolRun[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const msgCounterRef = useRef(0);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<(() => void) | null>(null);

  // Animate new messages as they appear
  const prevCountRef = useRef(0);
  useGSAP(() => {
    if (!messagesContainerRef.current) return;
    const children = messagesContainerRef.current.children;
    const msgElements = Array.from(children).filter(
      (c) => c.classList.contains("chat-msg") && !c.classList.contains("chat-typing")
    );
    if (msgElements.length > prevCountRef.current) {
      const newMsgs = msgElements.slice(prevCountRef.current);
      gsap.from(newMsgs, {
        y: 16,
        opacity: 0,
        scale: 0.97,
        duration: 0.35,
        stagger: 0.06,
        ease: "back.out(1.2)",
      });
    }
    prevCountRef.current = msgElements.length;
  }, { dependencies: [localMessages], scope: messagesContainerRef });

  // Animate agent plan steps
  const planRef = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (!planRef.current) return;
    const steps = planRef.current.querySelectorAll(".agent-plan-step");
    const runningStep = Array.from(steps).find((s) =>
      s.classList.contains("agent-plan-running")
    );
    if (runningStep) {
      gsap.from(runningStep, {
        scale: 0.95,
        duration: 0.3,
        ease: "back.out(1.4)",
      });
    }
  }, { dependencies: [runPlan], scope: planRef });

  function nextMsgId() {
    msgCounterRef.current += 1;
    return `local-msg-${msgCounterRef.current}`;
  }

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [d, w] = await Promise.all([
        fetchJson<ConversationDetail>(`/conversations/${id}`),
        fetchJson<Workspace>("/workspace"),
      ]);
      setDetail(d);
      setWorkspace(w);
      setLocalMessages((current) => current.length > 0 ? current : d.messages);
      if (w.personas[0]) setPersonaId(w.personas[0].id);
      const currentProject = w.projects.find((project) => project.id === d.projectId);
      if (currentProject) {
        setContextEnterpriseId(currentProject.enterpriseId);
        setContextProjectIds(w.projects.filter((project) => project.enterpriseId === currentProject.enterpriseId).map((project) => project.id));
      }
    } catch {
      setError("加载对话失败");
      showToast("加载对话失败", "error");
    } finally {
      setLoading(false);
    }
  }, [id, showToast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-send initial message from URL param
  const initialMsg = searchParams.get("msg");
  const msgSent = useRef(false);
  useEffect(() => {
    if (loading || !workspace || !initialMsg || msgSent.current) return;
    msgSent.current = true;
    const content = decodeURIComponent(initialMsg);
    const userMsg: Message = {
      id: nextMsgId(),
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    setLocalMessages((prev) => [...prev, userMsg]);
    setSending(true);
    setStreaming(true);
    setRunTools([]);
    setRunPlan([
      { id: "scope", title: "确认任务范围", detail: "正在识别本次请求的项目和资料范围。", status: "running" },
      { id: "context", title: "读取项目资料", detail: "等待读取当前企业的资料、自动化和历史对话。", status: "pending" },
      { id: "skills", title: "匹配 Agent 技能", detail: "等待选择适合的业务能力。", status: "pending" },
      { id: "tools", title: "执行工具或生成方案", detail: "等待模型决定是否调用工具。", status: "pending" },
      { id: "reply", title: "写入回复和执行记录", detail: "等待保存结果。", status: "pending" },
    ]);

    const aiMsgId = nextMsgId();
    setLocalMessages((prev) => [...prev, { id: aiMsgId, role: "assistant" as const, content: "", createdAt: new Date().toISOString() }]);
    setStreamingMsgId(aiMsgId);

    let fullContent = "";
    let resolvedPlanSteps: AgentPlanStep[] = [];
    let resolvedToolRuns: ToolRun[] = [];

    (async () => {
      try {
        const conn = connectSSE(`/conversations/${id}/messages/stream`, {
          content,
          personaId,
          skillIds: [],
          contextScope,
          contextProjectIds,
        }, getStoredToken() ?? undefined);
        abortRef.current = conn.abort;

        for await (const sseEvent of conn.events) {
          switch (sseEvent.event) {
            case "thinking": {
              const data = sseEvent.data as { message?: string };
              setRunPlan((prev) =>
                prev.map((step, i) => i === 0 ? { ...step, status: "running" as const, detail: data.message ?? step.detail } : step),
              );
              break;
            }
            case "tool_call": {
              const data = sseEvent.data as { toolId: string; toolName?: string };
              setRunPlan((prev) =>
                prev.map((step) => step.id === "tools" ? { ...step, status: "running" as const, detail: `正在执行 ${data.toolName ?? data.toolId}...` } : step),
              );
              break;
            }
            case "tool_result": {
              const data = sseEvent.data as { toolId: string; status: "success" | "error"; output?: string };
              resolvedToolRuns = [...resolvedToolRuns, {
                id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                toolId: data.toolId,
                status: data.status,
                input: {},
                output: data.output ?? "",
                createdAt: new Date().toISOString(),
              }];
              setRunTools(resolvedToolRuns);
              setRunPlan((prev) =>
                prev.map((step) => step.id === "tools" ? { ...step, status: "done" as const, detail: `${data.toolId} 执行${data.status === "success" ? "成功" : "失败"}` } : step),
              );
              break;
            }
            case "content_chunk": {
              const data = sseEvent.data as { delta: string };
              fullContent += data.delta;
              setLocalMessages((prev) => prev.map((m) => m.id === aiMsgId ? { ...m, content: fullContent } : m));
              break;
            }
            case "plan_update": {
              const data = sseEvent.data as { planSteps: AgentPlanStep[] };
              if (data.planSteps?.length) { resolvedPlanSteps = data.planSteps; setRunPlan(data.planSteps); }
              break;
            }
            case "done": {
              const data = sseEvent.data as { message?: { id: string; content: string }; planSteps?: AgentPlanStep[]; toolRuns?: ToolRun[] };
              if (data.message?.content) fullContent = data.message.content;
              if (data.planSteps?.length) resolvedPlanSteps = data.planSteps;
              if (data.toolRuns?.length) resolvedToolRuns = data.toolRuns;
              setRunPlan(resolvedPlanSteps.length > 0 ? resolvedPlanSteps : [
                { id: "scope", title: "确认任务范围", detail: "已确认本次请求范围。", status: "done" },
                { id: "context", title: "读取项目资料", detail: "已完成项目资料读取。", status: "done" },
                { id: "skills", title: "匹配 Agent 技能", detail: "已匹配相关业务能力。", status: "done" },
                { id: "tools", title: "执行工具或生成方案", detail: resolvedToolRuns.length > 0 ? `执行了 ${resolvedToolRuns.length} 个工具。` : "已生成方案。", status: "done" },
                { id: "reply", title: "写入回复和执行记录", detail: "已保存结果。", status: "done" },
              ]);
              setRunTools(resolvedToolRuns);
              setLocalMessages((prev) => prev.map((m) => m.id === aiMsgId ? { ...m, content: fullContent, id: data.message?.id ?? m.id } : m));
              break;
            }
            case "error": {
              const data = sseEvent.data as { message?: string };
              throw new Error(data.message ?? "Agent 执行出错");
            }
          }
        }
      } catch (e) {
        const errMsg = (e as Error).message || "消息发送失败，请重试";
        if (!fullContent) {
          showToast(errMsg, "error");
          setLocalMessages((prev) => prev.filter((m) => m.id !== userMsg.id && m.id !== aiMsgId));
        }
        setRunPlan((prev) =>
          prev.map((step) => step.status === "running" ? { ...step, status: "skipped" as const, detail: errMsg } : step),
        );
      } finally {
        abortRef.current = null;
        setSending(false);
        setStreaming(false);
        setStreamingMsgId(null);
      }
    })();
  }, [loading, workspace, initialMsg, personaId, contextScope, contextProjectIds, id, showToast]);

  useEffect(() => {
    if (!streamingMsgId) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [localMessages, streamingMsgId]);

  async function updateProject(projectId: string) {
    if (!detail || !workspace) return;
    const currentProject = workspace.projects.find((project) => project.id === detail.projectId);
    const nextProject = workspace.projects.find((project) => project.id === projectId);
    if (currentProject && nextProject && currentProject.enterpriseId !== nextProject.enterpriseId) {
      showToast("不能把对话切换到其他企业的项目", "error");
      return;
    }
    try {
      const updated = await fetchJson<ConversationDetail>(`/conversations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ projectId }),
      });
      setDetail(updated);
      if (nextProject) {
        setContextEnterpriseId(nextProject.enterpriseId);
        setContextProjectIds(
          contextScope === "current_project"
            ? [projectId]
            : workspace.projects.filter((project) => project.enterpriseId === nextProject.enterpriseId).map((project) => project.id),
        );
      }
    } catch {
      showToast("切换项目失败", "error");
    }
  }

  function updateContextScope(value: "current_project" | "selected_projects") {
    setContextScope(value);
    if (value === "current_project") {
      setContextProjectIds(detail ? [detail.projectId] : []);
    } else {
      const enterpriseId = contextEnterpriseId || workspace?.projects.find((project) => project.id === detail?.projectId)?.enterpriseId || workspace?.enterprises[0]?.id || "";
      setContextEnterpriseId(enterpriseId);
      setContextProjectIds(workspace?.projects.filter((project) => project.enterpriseId === enterpriseId).map((project) => project.id) ?? []);
    }
  }

  function updateContextEnterprise(enterpriseId: string) {
    setContextEnterpriseId(enterpriseId);
    setContextProjectIds(workspace?.projects.filter((project) => project.enterpriseId === enterpriseId).map((project) => project.id) ?? []);
  }

  async function addTag() {
    if (!detail || !tagInput.trim()) return;
    try {
      const newTags = [...detail.tags, tagInput.trim()];
      const updated = await fetchJson<ConversationDetail>(`/conversations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ tags: newTags }),
      });
      setDetail(updated);
      setTagInput("");
      setEditingTag(false);
    } catch {
      showToast("添加标签失败", "error");
    }
  }

  async function removeTag(tag: string) {
    if (!detail) return;
    try {
      const updated = await fetchJson<ConversationDetail>(`/conversations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ tags: detail.tags.filter((t) => t !== tag) }),
      });
      setDetail(updated);
    } catch {
      showToast("删除标签失败", "error");
    }
  }

  async function stopRun() {
    // Abort SSE connection
    if (abortRef.current) {
      abortRef.current();
      abortRef.current = null;
    }
    setSending(false);
    setStreaming(false);
    setStreamingMsgId(null);
    setRunPlan((prev) =>
      prev.map((step) =>
        step.status === "running" ? { ...step, status: "skipped", detail: "用户停止执行" } : step,
      ),
    );
    // Tell the backend to stop the active Agent run.
    try {
      await fetchJson(`/conversations/${id}/stop`, { method: "POST" });
    } catch {
      // Backend may not have this endpoint yet — ignore
    }
  }

  async function sendMessage() {
    if (!input.trim() || sending) return;
    const userContent = input.trim();
    const userMsg: Message = {
      id: nextMsgId(),
      role: "user",
      content: userContent,
      createdAt: new Date().toISOString(),
    };
    setLocalMessages((prev) => [...prev, userMsg]);
    setRunTools([]);
    setRunPlan([
      { id: "scope", title: "确认任务范围", detail: "正在识别本次请求的项目和资料范围。", status: "running" },
      { id: "context", title: "读取项目资料", detail: "等待读取当前企业的资料、自动化和历史对话。", status: "pending" },
      { id: "skills", title: "匹配 Agent 技能", detail: "等待选择适合的业务能力。", status: "pending" },
      { id: "tools", title: "执行工具或生成方案", detail: "等待模型决定是否调用工具。", status: "pending" },
      { id: "reply", title: "写入回复和执行记录", detail: "等待保存结果。", status: "pending" },
    ]);
    setInput("");
    setSending(true);
    setStreaming(true);

    // Create placeholder AI message
    const aiMsgId = nextMsgId();
    const aiMsg: Message = {
      id: aiMsgId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
    };
    setLocalMessages((prev) => [...prev, aiMsg]);
    setStreamingMsgId(aiMsgId);

    let fullContent = "";
    let resolvedPlanSteps: AgentPlanStep[] = [];
    let resolvedToolRuns: ToolRun[] = [];

    try {
      // Try SSE streaming
      const conn = connectSSE(`/conversations/${id}/messages/stream`, {
        content: userContent,
        personaId,
        skillIds: [],
        contextScope,
        contextProjectIds,
      });
      abortRef.current = conn.abort;

      for await (const sseEvent of conn.events) {
        switch (sseEvent.event) {
          case "thinking": {
            const data = sseEvent.data as { message?: string };
            setRunPlan((prev) =>
              prev.map((step, i) =>
                i === 0 ? { ...step, status: "running" as const, detail: data.message ?? step.detail } : step,
              ),
            );
            break;
          }
          case "tool_call": {
            const data = sseEvent.data as { toolId: string; toolName?: string; input?: Record<string, unknown> };
            setRunPlan((prev) =>
              prev.map((step) =>
                step.id === "tools" ? { ...step, status: "running" as const, detail: `正在执行 ${data.toolName ?? data.toolId}...` } : step,
              ),
            );
            break;
          }
          case "tool_result": {
            const data = sseEvent.data as { toolId: string; status: "success" | "error"; output?: string };
            const tr: ToolRun = {
              id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              toolId: data.toolId,
              status: data.status,
              input: {},
              output: data.output ?? "",
              createdAt: new Date().toISOString(),
            };
            resolvedToolRuns = [...resolvedToolRuns, tr];
            setRunTools(resolvedToolRuns);
            setRunPlan((prev) =>
              prev.map((step) =>
                step.id === "tools" ? { ...step, status: "done" as const, detail: `${data.toolId} 执行${data.status === "success" ? "成功" : "失败"}` } : step,
              ),
            );
            break;
          }
          case "content_chunk": {
            const data = sseEvent.data as { delta: string };
            fullContent += data.delta;
            setLocalMessages((prev) =>
              prev.map((m) => (m.id === aiMsgId ? { ...m, content: fullContent } : m)),
            );
            break;
          }
          case "plan_update": {
            const data = sseEvent.data as { planSteps: AgentPlanStep[] };
            if (data.planSteps?.length) {
              resolvedPlanSteps = data.planSteps;
              setRunPlan(data.planSteps);
            }
            break;
          }
          case "done": {
            const data = sseEvent.data as {
              message?: { id: string; role: string; content: string; createdAt: string };
              planSteps?: AgentPlanStep[];
              toolRuns?: ToolRun[];
            };
            if (data.message?.content) {
              fullContent = data.message.content;
            }
            if (data.planSteps?.length) resolvedPlanSteps = data.planSteps;
            if (data.toolRuns?.length) resolvedToolRuns = data.toolRuns;
            setRunPlan(resolvedPlanSteps.length > 0 ? resolvedPlanSteps : [
              { id: "scope", title: "确认任务范围", detail: "已确认本次请求范围。", status: "done" },
              { id: "context", title: "读取项目资料", detail: "已完成项目资料读取。", status: "done" },
              { id: "skills", title: "匹配 Agent 技能", detail: "已匹配相关业务能力。", status: "done" },
              { id: "tools", title: "执行工具或生成方案", detail: resolvedToolRuns.length > 0 ? `执行了 ${resolvedToolRuns.length} 个工具。` : "已生成方案。", status: "done" },
              { id: "reply", title: "写入回复和执行记录", detail: "已保存结果。", status: "done" },
            ]);
            setRunTools(resolvedToolRuns);
            setLocalMessages((prev) =>
              prev.map((m) => (m.id === aiMsgId ? { ...m, content: fullContent, id: data.message?.id ?? m.id } : m)),
            );
            break;
          }
          case "error": {
            const data = sseEvent.data as { message?: string };
            throw new Error(data.message ?? "Agent 执行出错");
          }
        }
      }
    } catch (e) {
      const errMsg = (e as Error).message || "消息发送失败，请重试";

      // Check if it's a conversation-not-found error
      if (errMsg.includes("Conversation not found") || errMsg.includes("不存在")) {
        showToast("该对话已被删除，正在刷新...", "error");
        setTimeout(() => window.location.reload(), 1000);
        setSending(false);
        setStreaming(false);
        return;
      }

      // If we got partial content, keep it; otherwise rollback
      if (!fullContent) {
        showToast(errMsg, "error");
        setLocalMessages((prev) => prev.filter((m) => m.id !== userMsg.id && m.id !== aiMsgId));
        setInput(userContent);
      } else {
        // Partial content — mark as done with what we have
        showToast(`执行中断: ${errMsg}`, "error");
      }

      setRunPlan((prev) =>
        prev.map((step) =>
          step.status === "running" ? { ...step, status: "skipped" as const, detail: errMsg } : step,
        ),
      );
    } finally {
      abortRef.current = null;
      setSending(false);
      setStreaming(false);
      setStreamingMsgId(null);
    }
  }

  if (loading) {
    return (
      <div className="chat-shell">
        <div className="loading">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="chat-shell">
        <ErrorState
          message={error || "对话不存在"}
          description="请检查对话是否已被删除，或返回列表重新选择"
          onRetry={refresh}
        />
      </div>
    );
  }

  const currentProject = workspace?.projects.find((project) => project.id === detail.projectId);
  const currentEnterpriseId = currentProject?.enterpriseId ?? detail.enterpriseId;
  const currentEnterpriseProjects = workspace?.projects.filter((project) => project.enterpriseId === currentEnterpriseId) ?? [];

  return (
    <div className="chat-shell">
      {/* Header */}
      <header className="chat-header">
        <button className="chat-back" onClick={() => router.push("/")} type="button" aria-label="返回首页">
          ←
        </button>
        <div className="chat-header-main">
          <h1 className="chat-title">{detail.title}</h1>
          <div className="chat-meta">
            <div className="chat-meta-row">
              <span className="chat-meta-label">项目</span>
              <select
                className="chat-project-select"
                value={detail.projectId}
                onChange={(e) => updateProject(e.target.value)}
              >
                {currentEnterpriseProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="chat-meta-row">
              <span className="chat-meta-label">Tags</span>
              <div className="chat-tags">
                {detail.tags.map((tag) => (
                  <span className="chat-tag" key={tag}>
                    {tag}
                    <button
                      className="chat-tag-remove"
                      onClick={() => removeTag(tag)}
                      type="button"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {editingTag ? (
                  <input
                    className="chat-tag-input"
                    autoFocus
                    placeholder="新标签"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addTag();
                      if (e.key === "Escape") {
                        setEditingTag(false);
                        setTagInput("");
                      }
                    }}
                  />
                ) : (
                  <button
                    className="chat-tag-add"
                    onClick={() => setEditingTag(true)}
                    type="button"
                  >
                    + 添加
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="chat-messages" ref={messagesContainerRef}>
        {localMessages.length === 0 && (
          <div className="chat-empty">暂无消息记录</div>
        )}
        {localMessages.map((msg) => (
          <MarkdownMessage
            key={msg.id}
            content={msg.content + (streamingMsgId === msg.id ? "▊" : "")}
            role={msg.role}
          />
        ))}
        {sending && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>

      <AgentRunPanel
        planSteps={runPlan}
        toolRuns={runTools}
        sending={sending}
        streaming={streaming}
        onStop={stopRun}
      />

      {/* Input */}
      <div className="chat-composer">
        <textarea
          className="chat-input"
          placeholder="输入消息，继续对话..."
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          maxLength={2000}
          aria-label="输入消息"
        />
        <button
          className="chat-send-btn"
          onClick={sendMessage}
          disabled={!input.trim() || sending}
          type="button"
          aria-label="发送消息"
        >
          发送
        </button>
        <div className="chat-composer-controls">
          <select
            className="composer-select composer-project"
            value={detail.projectId}
            onChange={(e) => updateProject(e.target.value)}
            aria-label="选择项目"
          >
            {currentEnterpriseProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="composer-plus" aria-hidden="true">
            +
          </span>
          <select
            className="composer-select"
            value={personaId}
            onChange={(e) => setPersonaId(e.target.value)}
            aria-label="选择角色"
          >
            {workspace?.personas.map((persona) => (
              <option key={persona.id} value={persona.id}>
                {persona.name}
              </option>
            ))}
          </select>
          <select
            className="composer-select"
            value={contextScope}
            onChange={(e) => updateContextScope(e.target.value as typeof contextScope)}
            aria-label="选择资料范围"
          >
            <option value="current_project">仅分析当前项目资料</option>
            <option value="selected_projects">结合指定项目资料</option>
          </select>
          {contextScope === "selected_projects" && (
            <select
              className="composer-select composer-enterprise-context"
              value={contextEnterpriseId}
              onChange={(e) => updateContextEnterprise(e.target.value)}
              aria-label="选择要结合的企业资料"
            >
              {workspace?.enterprises.map((enterprise) => (
                <option key={enterprise.id} value={enterprise.id}>
                  {enterprise.name}
                </option>
              ))}
            </select>
          )}
        </div>

      </div>
    </div>
  );
}
