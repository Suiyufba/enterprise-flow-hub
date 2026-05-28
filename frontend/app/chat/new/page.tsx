"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ConversationDetail } from "shared";
import { fetchJson } from "../../lib/api";
import { useWorkspace } from "../../lib/workspace-context";
import { useToast } from "../../lib/toast-context";
import { gsap, useGSAP } from "../../lib/gsap";
import { AppIcon } from "../../components/AppIcon";

export default function Home() {
  const router = useRouter();
  const [need, setNeed] = useState("");
  const [enterpriseId, setEnterpriseId] = useState("");
  const [projectId, setProjectId] = useState("");
  const { workspace, refresh } = useWorkspace();
  const [personaId, setPersonaId] = useState("");
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();
  const composerRef = useRef<HTMLDivElement>(null);
  const sendBtnRef = useRef<HTMLButtonElement>(null);

  useGSAP(() => {
    if (!composerRef.current) return;
    const ta = composerRef.current.querySelector("textarea");
    if (!ta) return;
    const onFocus = () =>
      gsap.to(composerRef.current, {
        boxShadow: "0 0 0 2px rgba(74, 144, 230, 0.25)",
        borderColor: "#4a90e6",
        duration: 0.3,
      });
    const onBlur = () =>
      gsap.to(composerRef.current, {
        boxShadow: "0 16px 36px rgba(0, 0, 0, 0.28)",
        borderColor: "var(--c-303030)",
        duration: 0.3,
      });
    ta.addEventListener("focus", onFocus);
    ta.addEventListener("blur", onBlur);
    return () => {
      ta.removeEventListener("focus", onFocus);
      ta.removeEventListener("blur", onBlur);
    };
  }, { scope: composerRef });

  useGSAP(() => {
    if (loading) {
      gsap.to(sendBtnRef.current, {
        scale: 0.97,
        duration: 0.6,
        repeat: -1,
        yoyo: true,
        ease: "power1.inOut",
      });
    } else {
      gsap.killTweensOf(sendBtnRef.current);
      gsap.set(sendBtnRef.current, { scale: 1 });
    }
  }, { dependencies: [loading], scope: sendBtnRef });

  const filteredProjects = workspace?.projects.filter((p) => p.enterpriseId === enterpriseId) ?? [];

  useEffect(() => {
    if (workspace.enterprises[0] && !enterpriseId) {
      setEnterpriseId(workspace.enterprises[0].id);
    }
    const urlProjectId = new URLSearchParams(window.location.search).get("projectId");
    if (urlProjectId && workspace.projects.some((p) => p.id === urlProjectId)) {
      setProjectId(urlProjectId);
      const proj = workspace.projects.find((p) => p.id === urlProjectId);
      if (proj) setEnterpriseId(proj.enterpriseId);
    } else if (workspace.projects[0] && !projectId) {
      setProjectId(workspace.projects[0].id);
    }
    if (workspace.personas[0] && !personaId) {
      setPersonaId(workspace.personas[0].id);
    }
  }, [enterpriseId, personaId, projectId, workspace.projects, workspace.personas, workspace.enterprises]);

  async function submit() {
    if (!need.trim() || loading) return;
    setLoading(true);

    try {
      // 1. Create a conversation so it persists in the sidebar
      const project = workspace.projects.find((p) => p.id === projectId);
      const enterpriseId = project?.enterpriseId ?? workspace.enterprises[0]?.id;
      if (!enterpriseId) {
        setLoading(false);
        return;
      }

      const conversation = await fetchJson<ConversationDetail>("/conversations", {
        method: "POST",
        body: JSON.stringify({
          enterpriseId,
          projectId,
          title: need.trim().slice(0, 30),
        }),
      });

      // Immediately navigate to chat page with initial message
      const msg = encodeURIComponent(need.trim());
      router.push(`/chat/${conversation.id}?msg=${msg}`);
    } catch (e) {
      let errMsg = "创建对话失败，请重试";
      try {
        const body = JSON.parse((e as Error).message);
        errMsg = body.error || body.detail || errMsg;
      } catch { /* not JSON */ }
      showToast(errMsg, "error");
      setLoading(false);
    }
  }

  return (
    <div className="main-inner" style={{ maxWidth: 800, paddingTop: 60 }}>
      <h1 className="main-title">今天想做什么？</h1>

      <div className="chat-composer" ref={composerRef}>
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
            ref={sendBtnRef}
            onClick={submit}
            disabled={!need.trim() || loading}
          >
            {loading ? "创建中..." : "发送"}
          </button>
        </div>

        <div className="chat-composer-controls">
          <div className="project-picker enterprise-picker">
            <AppIcon name="project" className="project-icon" />
            <select
              aria-label="选择企业"
              className="project-select"
              value={enterpriseId}
              onChange={(e) => {
                setEnterpriseId(e.target.value);
                const first = workspace?.projects.find((p) => p.enterpriseId === e.target.value);
                setProjectId(first?.id ?? "");
              }}
            >
              <option value="">选择企业</option>
              {workspace?.enterprises.map((ent) => (
                <option key={ent.id} value={ent.id}>{ent.name}</option>
              ))}
            </select>
          </div>
          <div className="project-picker subproject-picker">
            <span className="project-picker-label">子类</span>
            <select
              aria-label="选择项目"
              className="project-select"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={!enterpriseId}
            >
              {filteredProjects.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
              {filteredProjects.length === 0 && (
                <option value="">{enterpriseId ? "暂无项目" : "请先选企业"}</option>
              )}
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
          </select>
        </div>
      </div>
    </div>
  );
}
