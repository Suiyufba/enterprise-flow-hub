"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ConversationDetail, FileRecord } from "shared";
import { fetchJson } from "../../lib/api";
import { useWorkspace } from "../../lib/workspace-context";
import { useToast } from "../../lib/toast-context";
import { gsap, useGSAP } from "../../lib/gsap";
import { AppIcon } from "../../components/AppIcon";
import { alignChatAttachments, ChatAttachmentPicker, type ChatAttachmentPickerHandle } from "../../components/ChatAttachmentPicker";

const QUICK_STARTS = [
  { icon: "users" as const, label: "检查重复客户", prompt: "检查当前项目中的全部客户，按电话号码和姓名找出重复记录，并给出处理建议。" },
  { icon: "invoice" as const, label: "分析逾期发票", prompt: "分析当前项目的全部发票，找出已逾期和即将逾期的记录，并按风险排序。" },
  { icon: "orders" as const, label: "梳理订单风险", prompt: "检查当前项目的全部订单，汇总异常状态、未付款和需要跟进的订单。" },
  { icon: "automation" as const, label: "设计自动化", prompt: "根据当前项目资料，找出最适合自动化的重复工作，并设计可执行的工作流。" },
];

export default function Home() {
  const router = useRouter();
  const [need, setNeed] = useState("");
  const [enterpriseId, setEnterpriseId] = useState("");
  const [projectId, setProjectId] = useState("");
  const { workspace } = useWorkspace();
  const [personaId, setPersonaId] = useState("");
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();
  const composerRef = useRef<HTMLDivElement>(null);
  const sendBtnRef = useRef<HTMLButtonElement>(null);
  const attachmentPickerRef = useRef<ChatAttachmentPickerHandle>(null);
  const [attachments, setAttachments] = useState<FileRecord[]>([]);
  const [imageDragging, setImageDragging] = useState(false);

  function processDroppedFiles(files: FileList | File[]) {
    attachmentPickerRef.current?.processFiles(files);
  }

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
    if ((!need.trim() && attachments.length === 0) || loading) return;
    setLoading(true);

    try {
      // 1. Create a conversation so it persists in the sidebar
      if (!enterpriseId) {
        setLoading(false);
        showToast("请先选择企业", "error");
        return;
      }

      const alignedAttachments = await alignChatAttachments(attachments, projectId);
      setAttachments(alignedAttachments);
      const conversation = await fetchJson<ConversationDetail>("/conversations", {
        method: "POST",
        body: JSON.stringify({
          enterpriseId,
          projectId,
          title: need.trim().slice(0, 30) || `分析 ${alignedAttachments[0]?.filename ?? "附件"}`,
        }),
      });

      // Immediately navigate to chat page with initial message
      const msg = encodeURIComponent(need.trim() || "请分析本轮上传的附件。");
      const persona = personaId ? `&personaId=${encodeURIComponent(personaId)}` : "";
      const files = alignedAttachments.length ? `&fileIds=${encodeURIComponent(alignedAttachments.map((file) => file.id).join(","))}` : "";
      router.push(`/chat/${conversation.id}?msg=${msg}${persona}${files}`);
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
    <div className="main-inner new-chat-page">
      <div className="new-chat-heading">
        <h1 className="main-title">今天想推进什么？</h1>
        <p>选择业务范围，Agent 会在该范围内查询、分析并执行操作。</p>
      </div>

      <div className="chat-quick-starts" aria-label="常用任务">
        {QUICK_STARTS.map((item) => (
          <button key={item.label} className="chat-quick-start" onClick={() => setNeed(item.prompt)} type="button">
            <AppIcon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <div
        className={`chat-composer ${imageDragging ? "is-image-dragging" : ""}`}
        ref={composerRef}
        onDragEnter={(event) => { event.preventDefault(); setImageDragging(true); }}
        onDragOver={(event) => { event.preventDefault(); setImageDragging(true); }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setImageDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setImageDragging(false);
          processDroppedFiles(event.dataTransfer.files);
        }}
      >
        <textarea
          className="chat-input"
          placeholder="描述你的业务需求，如：帮我看这组客户表和聊天记录，怎么减少顾问漏跟进？"
          rows={3}
          value={need}
          onChange={(e) => setNeed(e.target.value)}
          onPaste={(event) => {
            const itemImages = Array.from(event.clipboardData.items)
              .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
              .map((item) => item.getAsFile())
              .filter((file): file is File => Boolean(file));
            const images = itemImages.length
              ? itemImages
              : Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
            if (images.length > 0) {
              event.preventDefault();
              processDroppedFiles(images);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          maxLength={500}
          aria-label="输入业务需求"
        />
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button
            className="chat-send-btn"
            ref={sendBtnRef}
            onClick={submit}
            disabled={(!need.trim() && attachments.length === 0) || loading}
            aria-label="发送消息"
          >
            {loading ? "创建中..." : "发送"}
          </button>
        </div>

        <div className="chat-composer-controls">
          <ChatAttachmentPicker
            ref={attachmentPickerRef}
            projectId={projectId}
            files={attachments}
            onChange={setAttachments}
          />
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
