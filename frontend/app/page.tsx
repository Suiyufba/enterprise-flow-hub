"use client";

import { useEffect, useState, useRef } from "react";
import type { AnalysisResult, AnalysisRequest } from "shared";
import { fetchJson } from "./lib/api";
import { useWorkspace } from "./lib/workspace-context";
import MarkdownMessage from "./components/MarkdownMessage";

type Message = {
  role: "user" | "assistant";
  content: string;
};

function formatResult(result: AnalysisResult): string {
  const lines: string[] = [];
  lines.push(`## ${result.summary}`);
  lines.push("");

  if (result.screenshotTypes.length > 0) {
    lines.push("### 截图识别");
    lines.push(result.screenshotTypes.map((t) => `- ${t}`).join("\n"));
    lines.push("");
  }
  if (result.businessObjects.length > 0) {
    lines.push("### 业务对象");
    lines.push(result.businessObjects.map((o) => `- ${o}`).join("\n"));
    lines.push("");
  }
  if (result.fields.length > 0) {
    lines.push("### 提取字段");
    for (const f of result.fields) {
      const missing = f.missing ? " ⚠️ 缺失" : "";
      lines.push(`- **${f.label}** (\`${f.name}\`) → ${f.type}${missing}`);
    }
    lines.push("");
  }
  if (result.workflowStages.length > 0) {
    lines.push("### 流程阶段");
    lines.push(result.workflowStages.map((s, i) => `${i + 1}. ${s}`).join("\n"));
    lines.push("");
  }
  if (result.problems.length > 0) {
    lines.push("### ⚠️ 流程问题");
    for (const p of result.problems) {
      lines.push(`- ⚠️ ${p}`);
    }
    lines.push("");
  }
  if (result.automationRules.length > 0) {
    lines.push("### 🔔 自动化规则建议");
    for (const r of result.automationRules) {
      lines.push(`- IF **${r.trigger}** AND **${r.condition}** → ${r.action}`);
    }
    lines.push("");
  }
  if (result.dashboardMetrics.length > 0) {
    lines.push("### 📊 建议仪表盘指标");
    lines.push(result.dashboardMetrics.map((m) => `- ${m}`).join("\n"));
    lines.push("");
  }
  if (result.implementationPlan.length > 0) {
    lines.push("### 实施建议");
    for (const s of result.implementationPlan) {
      lines.push(`1. ${s}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export default function Home() {
  const [need, setNeed] = useState("");
  const [projectId, setProjectId] = useState("proj-qihang-growth");
  const { workspace } = useWorkspace();
  const [personaId, setPersonaId] = useState("persona-ops-cto");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const urlProjectId = new URLSearchParams(window.location.search).get("projectId");
    if (urlProjectId && workspace.projects.some((p) => p.id === urlProjectId)) {
      setProjectId(urlProjectId);
    } else if (workspace.projects[0]) {
      setProjectId(workspace.projects[0].id);
    }
    if (workspace.personas[0]) {
      setPersonaId(workspace.personas[0].id);
    }
  }, [workspace.projects, workspace.personas]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function submit() {
    if (!need.trim() || loading) return;

    const userMessage = need.trim();
    setNeed("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      const data = await fetchJson<AnalysisResult>("/analysis", {
        method: "POST",
        body: JSON.stringify({
          need: userMessage,
          screenshotCount: 1,
        } satisfies AnalysisRequest),
      });
      sessionStorage.setItem(`analysis:${data.id}`, JSON.stringify(data));
      setMessages((prev) => [...prev, { role: "assistant", content: formatResult(data) }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "抱歉，分析请求失败，请稍后重试。" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="main-inner" style={{ maxWidth: 800 }}>
      {/* Messages area */}
      {messages.length > 0 ? (
        <div className="chat-messages" style={{ marginBottom: 20 }}>
          {messages.map((msg, i) => (
            <MarkdownMessage key={i} content={msg.content} role={msg.role} />
          ))}
          {loading && (
            <div className="chat-msg chat-msg-assistant chat-typing">
              <div className="chat-msg-content">正在分析</div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      ) : (
        <h1 className="main-title">今天想做什么？</h1>
      )}

      {/* Input area */}
      <div className="chat-composer">
        <textarea
          className="chat-input"
          placeholder="描述你的业务需求，如：帮我看这组客户表和聊天记录，怎么减少顾问漏跟进？"
          rows={3}
          value={need}
          onChange={(e) => setNeed(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button
            className="chat-send-btn"
            onClick={submit}
            disabled={!need.trim() || loading}
          >
            发送
          </button>
        </div>

        <div className="chat-composer-controls">
          <div className="project-picker">
            <span className="project-icon">▱</span>
            <select
              aria-label="选择企业项目"
              className="project-select"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              {workspace?.projects.map((item) => {
                const enterprise = workspace.enterprises.find(
                  (e) => e.id === item.enterpriseId,
                );
                return (
                  <option key={item.id} value={item.id}>
                    {enterprise?.name ?? "未知企业"} / {item.name}
                  </option>
                );
              })}
              {!workspace && <option value="proj-qihang-growth">启航留学 / 线索增长</option>}
            </select>
          </div>
          <select
            className="access-select"
            value={personaId}
            onChange={(e) => setPersonaId(e.target.value)}
            aria-label="选择角色"
            style={{ border: 0, borderRadius: 10, background: "var(--c-303030)", color: "var(--c-d4d4d4)", fontSize: 13, fontWeight: 700, padding: "9px 12px" }}
          >
            {workspace?.personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            {!workspace && <option value="persona-ops-cto">轻量自动化 CTO</option>}
          </select>
        </div>
      </div>
    </div>
  );
}
