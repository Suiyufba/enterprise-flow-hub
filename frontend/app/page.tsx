"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { AnalysisResult, AnalysisRequest } from "shared";
import { fetchJson } from "./lib/api";
import { useWorkspace } from "./lib/workspace-context";

export default function Home() {
  const router = useRouter();
  const [need, setNeed] = useState("");
  const [projectId, setProjectId] = useState("proj-qihang-growth");
  const { workspace } = useWorkspace();
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [personaId, setPersonaId] = useState("persona-ops-cto");
  const [contextScope, setContextScope] = useState("current_project");
  const [contextEnterpriseId, setContextEnterpriseId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const urlProjectId = new URLSearchParams(window.location.search).get("projectId");
    if (urlProjectId && workspace.projects.some((p) => p.id === urlProjectId)) {
      setProjectId(urlProjectId);
      const proj = workspace.projects.find((p) => p.id === urlProjectId);
      if (proj) setContextEnterpriseId(proj.enterpriseId);
    } else if (workspace.projects[0]) {
      setProjectId(workspace.projects[0].id);
      setContextEnterpriseId(workspace.projects[0].enterpriseId);
    }
    if (workspace.personas[0]) {
      setPersonaId(workspace.personas[0].id);
    }
  }, [workspace.projects, workspace.personas]);

  function handleFiles(selected: FileList | null) {
    if (!selected) return;
    const incoming = Array.from(selected).slice(0, 8);
    const merged = [...files, ...incoming].slice(0, 8);
    setFiles(merged);
    setPreviews(merged.map((f) => URL.createObjectURL(f)));
  }

  function removeFile(i: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
    setPreviews((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateScope(value: string) {
    setContextScope(value);
    if (value === "selected_projects" && !contextEnterpriseId) {
      const currentProject = workspace?.projects.find((project) => project.id === projectId);
      setContextEnterpriseId(currentProject?.enterpriseId ?? workspace?.enterprises[0]?.id ?? "");
    }
  }

  async function submit() {
    if (!need.trim()) return;
    setLoading(true);
    setError("");

    try {
      const data = await fetchJson<AnalysisResult>("/analysis", {
        method: "POST",
        body: JSON.stringify({
          need: need.trim(),
          screenshotCount: files.length || 1,
        } satisfies AnalysisRequest),
      });
      sessionStorage.setItem(`analysis:${data.id}`, JSON.stringify(data));
      router.push(`/results?id=${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "未知错误");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="main-inner">
        <div className="loading">
          <div className="spinner" />
          <p>AI 正在分析你的业务流程...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="main-inner">
      <h1 className="main-title">想优化哪个业务流程？</h1>

      {/* Prompt Card */}
      <div className="prompt-card">
        <div className="prompt-input-row">
          <textarea
            placeholder="例如：帮我看这组客户表和聊天记录，怎么减少顾问漏跟进？"
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
        </div>

        <div className="prompt-main-row">
          <div className="prompt-left-actions">
            <button
              className="attach-btn"
              onClick={() => fileInputRef.current?.click()}
              title="上传文件"
              type="button"
            >
              +
            </button>
            <div className="project-picker">
              <span className="project-icon">▱</span>
              <select
                aria-label="选择企业项目"
                className="project-select"
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  const project = workspace?.projects.find((item) => item.id === e.target.value);
                  if (project && contextScope === "selected_projects") {
                    setContextEnterpriseId(project.enterpriseId);
                  }
                }}
              >
                {workspace?.projects.map((item) => {
                  const enterprise = workspace.enterprises.find((enterpriseItem) => enterpriseItem.id === item.enterpriseId);
                  const label = `${enterprise?.name ?? "未知企业"} / ${item.name}`;
                  return <option key={item.id} value={item.id}>{label}</option>;
                })}
                {!workspace && <option value="proj-qihang-growth">启航留学 / 线索增长</option>}
              </select>
            </div>
            <span className="prompt-decor-plus" aria-hidden="true">
              +
            </span>
            <select className="access-select" value={personaId} onChange={(e) => setPersonaId(e.target.value)} aria-label="选择角色">
              {workspace?.personas.map((persona) => (
                <option key={persona.id} value={persona.id}>{persona.name}</option>
              ))}
              {!workspace && <option value="persona-ops-cto">轻量自动化 CTO</option>}
            </select>
            <select className="access-select" value={contextScope} onChange={(e) => updateScope(e.target.value)} aria-label="选择资料范围">
              <option value="current_project">仅分析当前项目资料</option>
              <option value="selected_projects">结合指定项目资料</option>
            </select>
            {contextScope === "selected_projects" && (
              <select className="access-select" value={contextEnterpriseId} onChange={(e) => setContextEnterpriseId(e.target.value)} aria-label="选择要结合的企业资料">
                {workspace?.enterprises.map((enterprise) => (
                  <option key={enterprise.id} value={enterprise.id}>{enterprise.name}</option>
                ))}
              </select>
            )}
          </div>

          <div className="prompt-right-actions">
            <button
              className="submit-btn"
              onClick={submit}
              disabled={!need.trim()}
              title="开始分析"
            >
              开始诊断
            </button>
          </div>
        </div>

        {/* Bottom row */}
        {files.length > 0 && (
          <div className="prompt-bottom-row">
            <span className="file-list">{files.map((f) => f.name).join(", ")}</span>
          </div>
        )}

      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.xlsx,.xls,.csv,.pdf,.doc,.docx,.txt"
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Screenshot Previews */}
      {previews.length > 0 && (
        <div className="screenshot-previews">
          {previews.map((url, i) => (
            <div key={i} className="screenshot-preview-item">
              <img src={url} alt={`Screenshot ${i + 1}`} className="screenshot-thumb" />
              <button
                onClick={() => removeFile(i)}
                className="screenshot-remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {/* Quick Start Cards */}
      <div className="cards-grid">
        <div className="action-card" onClick={() => fileInputRef.current?.click()}>
          <div className="card-icon purple">📸</div>
          <h3>上传业务截图</h3>
          <p>上传 Excel、CRM 页面或聊天记录，AI 自动识别流程</p>
        </div>
        <div className="action-card" onClick={() => setNeed("帮我分析销售跟进流程，找出漏跟进的线索并设计自动化提醒规则。")}>
          <div className="card-icon blue">📋</div>
          <h3>销售跟进诊断</h3>
          <p>分析线索分配、跟进频率，找出漏跟问题并设计自动提醒</p>
        </div>
        <div className="action-card" onClick={() => router.push("/chat/chat-qihang-leads")}>
          <div className="card-icon green">📊</div>
          <h3>查看诊断案例</h3>
          <p>点击查看线索管理的完整诊断对话案例</p>
        </div>
      </div>
    </div>
  );
}
