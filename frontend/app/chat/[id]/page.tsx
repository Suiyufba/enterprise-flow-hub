"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import type { ConversationDetail, Message, Workspace } from "shared";
import { fetchJson } from "../../lib/api";
import { useToast } from "../../lib/toast-context";
import MarkdownMessage from "../../components/MarkdownMessage";

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
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
  const [personaId, setPersonaId] = useState("persona-ops-cto");
  const [contextScope, setContextScope] = useState<"current_project" | "selected_projects">("current_project");
  const [contextEnterpriseId, setContextEnterpriseId] = useState("");
  const [contextProjectIds, setContextProjectIds] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const msgCounterRef = useRef(0);

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
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages]);

  async function updateProject(projectId: string) {
    if (!detail) return;
    try {
      const updated = await fetchJson<ConversationDetail>(`/conversations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ projectId }),
      });
      setDetail(updated);
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
    setInput("");
    setSending(true);

    try {
      const aiMsg = await fetchJson<Message>(`/conversations/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          content: userMsg.content,
          personaId,
          skillIds: [],
          contextScope,
          contextProjectIds,
        }),
      });
      setLocalMessages((prev) => [...prev, aiMsg]);
    } catch {
      showToast("消息发送失败，请重试", "error");
      setLocalMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      setInput(userMsg.content);
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
                {workspace?.projects.map((p) => (
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
      <div className="chat-messages">
        {localMessages.length === 0 && (
          <div className="chat-empty">暂无消息记录</div>
        )}
        {localMessages.map((msg) => (
          <MarkdownMessage key={msg.id} content={msg.content} role={msg.role} />
        ))}
        {sending && (
          <div className="chat-msg chat-msg-assistant chat-typing">
            <div className="chat-msg-content">正在思考...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

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
            {workspace?.projects.map((p) => {
              const enterprise = workspace.enterprises.find((item) => item.id === p.enterpriseId);
              return (
                <option key={p.id} value={p.id}>
                  {enterprise?.name ?? "企业"} / {p.name}
                </option>
              );
            })}
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
