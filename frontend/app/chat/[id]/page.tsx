"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { AddMessageResponse, AgentPlanStep, ConversationDetail, Message, ToolRun, Workspace } from "shared";
import { fetchJson } from "../../lib/api";
import { useToast } from "../../lib/toast-context";
import MarkdownMessage from "../../components/MarkdownMessage";
import { TypingIndicator } from "../../components/TypingIndicator";
import { gsap, useGSAP } from "../../lib/gsap";
import { animate } from "../../lib/anime";

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
    try {
      const [d, w] = await Promise.all([
        fetchJson<ConversationDetail>(`/conversations/${id}`),
        fetchJson<Workspace>("/workspace"),
      ]);
      setDetail(d);
      setWorkspace(w);
      setLocalMessages(d.messages);
      if (w.personas[0]) setPersonaId(w.personas[0].id);
      const currentProject = w.projects.find((project) => project.id === d.projectId);
      if (currentProject) {
        setContextEnterpriseId(currentProject.enterpriseId);
        setContextProjectIds(w.projects.filter((project) => project.enterpriseId === currentProject.enterpriseId).map((project) => project.id));
      }
    } catch {
      setError("对话不存在");
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
    if (!loading && workspace && initialMsg && !msgSent.current) {
      msgSent.current = true;
      const userMsg: Message = {
        id: nextMsgId(),
        role: "user",
        content: decodeURIComponent(initialMsg),
        createdAt: new Date().toISOString(),
      };
      setLocalMessages((prev) => [...prev, userMsg]);
      // Trigger send
      (async () => {
        setSending(true);
        setRunTools([]);
        setRunPlan([
          { id: "scope", title: "确认任务范围", detail: "正在识别本次请求的项目和资料范围。", status: "running" },
          { id: "context", title: "读取项目资料", detail: "等待读取当前企业的资料、自动化和历史对话。", status: "pending" },
          { id: "skills", title: "匹配 Agent 技能", detail: "等待选择适合的业务能力。", status: "pending" },
          { id: "tools", title: "执行工具或生成方案", detail: "等待模型决定是否调用工具。", status: "pending" },
          { id: "reply", title: "写入回复和执行记录", detail: "等待保存结果。", status: "pending" },
        ]);
        try {
          const result = await fetchJson<AddMessageResponse>(`/conversations/${id}/messages`, {
            method: "POST",
            body: JSON.stringify({
              content: userMsg.content,
              personaId,
              skillIds: [],
              contextScope,
              contextProjectIds,
            }),
          });
          setRunPlan(result.planSteps);
          setRunTools(result.toolRuns);
          // Stream-fill
          const aiMsg = { ...result.message, content: "" };
          setLocalMessages((prev) => [...prev, aiMsg]);
          setStreamingMsgId(aiMsg.id);
          const fullContent = result.message.content;
          const streamObj = { progress: 0 };
          animate(streamObj, {
            progress: fullContent.length,
            duration: Math.max(500, Math.min(4000, fullContent.length * 25)),
            ease: "outExpo",
            onUpdate: () => {
              const pos = Math.floor(streamObj.progress);
              setLocalMessages((prev) => prev.map((m) => m.id === aiMsg.id ? { ...m, content: fullContent.slice(0, pos) } : m));
            },
            onComplete: () => {
              setLocalMessages((prev) => prev.map((m) => m.id === aiMsg.id ? { ...m, content: fullContent } : m));
              setStreamingMsgId(null);
            },
          });
        } catch (e) {
          let errMsg = "消息发送失败，请重试";
          try {
            const raw = (e as Error).message;
            const body = JSON.parse(raw);
            errMsg = body.error || body.detail || errMsg;
          } catch { /* not JSON */ }
          showToast(errMsg, "error");
          setLocalMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
        } finally {
          setSending(false);
        }
      })();
    }
  }, [loading, workspace, initialMsg]);

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

  async function sendMessage() {
    if (!input.trim() || sending) return;
    const userMsg: Message = {
      id: nextMsgId(),
      role: "user",
      content: input.trim(),
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

    try {
      const result = await fetchJson<AddMessageResponse>(`/conversations/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          content: userMsg.content,
          personaId,
          skillIds: [],
          contextScope,
          contextProjectIds,
        }),
      });
      setRunPlan(result.planSteps);
      setRunTools(result.toolRuns);
      // Add message with empty content, then stream-fill
      const aiMsg = { ...result.message, content: "" };
      setLocalMessages((prev) => [...prev, aiMsg]);
      setStreamingMsgId(aiMsg.id);

      const fullContent = result.message.content;
      const streamObj = { progress: 0 };
      animate(streamObj, {
        progress: fullContent.length,
        duration: Math.max(500, Math.min(4000, fullContent.length * 25)),
        ease: "outExpo",
        onUpdate: () => {
          const pos = Math.floor(streamObj.progress);
          setLocalMessages((prev) => prev.map((m) => m.id === aiMsg.id ? { ...m, content: fullContent.slice(0, pos) } : m));
        },
        onComplete: () => {
          setLocalMessages((prev) => prev.map((m) => m.id === aiMsg.id ? { ...m, content: fullContent } : m));
          setStreamingMsgId(null);
        },
      });
    } catch (e) {
      let errMsg = "消息发送失败，请重试";
      try {
        const raw = (e as Error).message;
        console.error("[chat] sendMessage failed:", raw);
        const body = JSON.parse(raw);
        errMsg = body.error || body.detail || errMsg;
        if (body.error?.includes("Conversation not found") || body.error?.includes("不存在")) {
          showToast("该对话已被删除，正在刷新...", "error");
          setTimeout(() => window.location.reload(), 1000);
          setSending(false);
          return;
        }
      } catch { /* not JSON */ }
      showToast(errMsg, "error");
      setLocalMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      setInput(userMsg.content);
      setRunPlan((prev) =>
        prev.map((step) => step.status === "running" ? { ...step, status: "skipped", detail: errMsg } : step),
      );
    } finally {
      setSending(false);
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
        <div className="chat-empty">{error || "对话不存在"}</div>
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
        <button className="chat-back" onClick={() => router.push("/")} type="button">
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

      {(runPlan.length > 0 || runTools.length > 0) && (
        <section className="agent-run-panel" aria-label="Agent 执行计划" ref={planRef}>
          <div className="agent-run-header">
            <div>
              <span className="agent-run-kicker">Agent Run</span>
              <h2>执行计划</h2>
            </div>
            <span className="agent-run-summary">
              {runTools.length > 0 ? `${runTools.length} 个工具调用` : sending ? "执行中" : "已完成"}
            </span>
          </div>

          <div className="agent-plan-list">
            {runPlan.map((step, index) => (
              <div className={`agent-plan-step agent-plan-${step.status}`} key={step.id}>
                <span className="agent-plan-index">{index + 1}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.detail}</p>
                </div>
              </div>
            ))}
          </div>

          {runTools.length > 0 && (
            <div className="agent-tool-list">
              {runTools.map((tool) => (
                <div className={`agent-tool-row agent-tool-${tool.status}`} key={tool.id}>
                  <strong>{tool.toolId}</strong>
                  <span>{tool.status === "success" ? "成功" : "失败"}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

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
        />
        <button
          className="chat-send-btn"
          onClick={sendMessage}
          disabled={!input.trim() || sending}
          type="button"
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
