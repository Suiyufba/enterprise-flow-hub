"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchJson } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import { useToast } from "../lib/toast-context";
import { ConfirmDialog } from "./ConfirmDialog";
import { SettingsModal } from "./SettingsModal";
import { AnimateHeight } from "./AnimateHeight";

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { workspace, refresh } = useWorkspace();
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [chatExpanded, setChatExpanded] = useState<Set<string>>(new Set());
  const [navGroups, setNavGroups] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("efh_nav_groups");
      return saved ? new Set(JSON.parse(saved)) : new Set(["ai-tools"]);
    } catch {
      return new Set(["ai-tools"]);
    }
  });

  function toggleNavGroup(id: string) {
    setNavGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem("efh_nav_groups", JSON.stringify([...next]));
      return next;
    });
  }
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renamingConversationId, setRenamingConversationId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; type: "project" | "conversation" } | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (workspace.enterprises.length > 0) {
      setExpanded(new Set(workspace.enterprises.map((e) => e.id)));
      setChatExpanded(new Set(workspace.enterprises.map((e) => e.id)));
    }
  }, [workspace.enterprises]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleChatGroup(id: string) {
    setChatExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addProject(enterpriseId: string) {
    if (!newName.trim()) return;
    await fetchJson("/projects", {
      method: "POST",
      body: JSON.stringify({ enterpriseId, name: newName.trim() }),
    });
    setNewName("");
    setAddingTo(null);
    await refresh();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === "project") {
        await fetchJson(`/projects/${deleteTarget.id}`, { method: "DELETE" });
        await refresh();
        if (pathname === `/projects/${deleteTarget.id}`) router.push("/");
      } else {
        await fetchJson(`/conversations/${deleteTarget.id}`, { method: "DELETE" });
        await refresh();
      }
    } catch {
      showToast("删除失败，请重试", "error");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  function showDeleteConfirm(id: string, name: string, type: "project" | "conversation", e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setDeleteTarget({ id, name, type });
  }

  async function removeConversation(id: string, e: React.MouseEvent) {
    showDeleteConfirm(id, workspace.conversations.find((c) => c.id === id)?.title ?? "对话", "conversation", e);
  }

  async function removeProject(id: string, e: React.MouseEvent) {
    showDeleteConfirm(id, workspace.projects.find((p) => p.id === id)?.name ?? "项目", "project", e);
  }

  function startRenameProject(id: string, name: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setRenamingProjectId(id);
    setRenamingConversationId(null);
    setRenameValue(name);
  }

  function startRenameConversation(id: string, title: string, e: React.MouseEvent) {
    e.stopPropagation();
    setRenamingConversationId(id);
    setRenamingProjectId(null);
    setRenameValue(title);
  }

  async function submitProjectRename(id: string) {
    if (!renameValue.trim()) return;
    await fetchJson(`/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: renameValue.trim() }),
    });
    setRenamingProjectId(null);
    setRenameValue("");
    await refresh();
  }

  async function submitConversationRename(id: string) {
    if (!renameValue.trim()) return;
    await fetchJson(`/conversations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: renameValue.trim() }),
    });
    setRenamingConversationId(null);
    setRenameValue("");
    await refresh();
  }

  function cancelRename() {
    setRenamingProjectId(null);
    setRenamingConversationId(null);
    setRenameValue("");
  }

  return (
    <aside className="sidebar">
      <nav className="primary-nav" aria-label="主导航">
        <Link href="/" className={`nav-item ${pathname === "/" ? "active" : ""}`}>
          <span className="icon">◫</span> 仪表盘
        </Link>

        <button
          className="nav-group-header"
          onClick={() => toggleNavGroup("ai-tools")}
          type="button"
        >
          <span className={`tree-chevron ${navGroups.has("ai-tools") ? "open" : ""}`}>▸</span>
          AI 工具
        </button>
        {navGroups.has("ai-tools") && (
          <div className="nav-group-items">
            <Link href="/chat/new" className={`nav-item ${pathname === "/chat/new" ? "active" : ""}`}>
              <span className="icon">✎</span> 新对话
            </Link>
            <Link href="/search" className={`nav-item ${pathname === "/search" ? "active" : ""}`}>
              <span className="icon">⌕</span> 搜索
            </Link>
            <Link href="/library" className={`nav-item ${pathname === "/library" ? "active" : ""}`}>
              <span className="icon">▣</span> 资料库
            </Link>
            <Link href="/plugins" className={`nav-item ${pathname === "/plugins" ? "active" : ""}`}>
              <span className="icon">⌘</span> 插件
            </Link>
            <Link href="/automation" className={`nav-item ${pathname === "/automation" ? "active" : ""}`}>
              <span className="icon">◷</span> 自动化
            </Link>
            <Link href="/personas" className={`nav-item ${pathname === "/personas" ? "active" : ""}`}>
              <span className="icon">◈</span> 人格
            </Link>
          </div>
        )}

        <button
          className="nav-group-header"
          onClick={() => toggleNavGroup("business")}
          type="button"
        >
          <span className={`tree-chevron ${navGroups.has("business") ? "open" : ""}`}>▸</span>
          业务
        </button>
        {navGroups.has("business") && (
          <div className="nav-group-items">
            <Link href="/customers" className={`nav-item ${pathname === "/customers" ? "active" : ""}`}>
              <span className="icon">👥</span> 客户
            </Link>
            <Link href="/suppliers" className={`nav-item ${pathname === "/suppliers" ? "active" : ""}`}>
              <span className="icon">🏭</span> 供应商
            </Link>
            <Link href="/products" className={`nav-item ${pathname === "/products" ? "active" : ""}`}>
              <span className="icon">📦</span> 商品
            </Link>
          </div>
        )}

        <button
          className="nav-group-header"
          onClick={() => toggleNavGroup("system")}
          type="button"
        >
          <span className={`tree-chevron ${navGroups.has("system") ? "open" : ""}`}>▸</span>
          系统
        </button>
        {navGroups.has("system") && (
          <div className="nav-group-items">
            {user?.role === "admin" && (
              <Link href="/enterprise" className={`nav-item ${pathname === "/enterprise" ? "active" : ""}`}>
                <span className="icon">▦</span> 企业管理
              </Link>
            )}
          </div>
        )}
      </nav>

      <div className="sidebar-scroll">

      <div className="sidebar-section-header">
        <span>项目</span>
        <div className="sidebar-section-actions">
          <Link aria-label="新增项目" className="icon-action add-project-action" href="/projects/new">
            新增项目
          </Link>
        </div>
      </div>

      <div className="enterprise-list">
        {workspace.enterprises.map((enterprise) => {
          const isOpen = expanded.has(enterprise.id);
          const projects = workspace.projects.filter(
            (p) => p.enterpriseId === enterprise.id,
          );

          return (
            <div className="enterprise-group" key={enterprise.id}>
              <button
                className="enterprise-toggle"
                onClick={() => toggle(enterprise.id)}
                type="button"
              >
                <span className={`tree-chevron ${isOpen ? "open" : ""}`}>▸</span>
                <span className="enterprise-name">{enterprise.name}</span>
              </button>

              <AnimateHeight open={isOpen}>
                <div className="sub-list">
                  {projects.map((project) => (
                    renamingProjectId === project.id ? (
                      <div className="sidebar-rename-row" key={project.id}>
                        <input
                          className="inline-input"
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") submitProjectRename(project.id);
                            if (e.key === "Escape") cancelRename();
                          }}
                        />
                        <button className="inline-confirm" onClick={() => submitProjectRename(project.id)} type="button">✓</button>
                        <button className="inline-cancel" onClick={cancelRename} type="button">×</button>
                      </div>
                    ) : (
                      <Link
                        className={`sub-item sidebar-editable-row ${pathname === `/projects/${project.id}` ? "active" : ""}`}
                        href={`/projects/${project.id}`}
                        key={project.id}
                      >
                        <span className="sub-item-icon">▱</span>
                        <span className="sidebar-row-title">{project.name}</span>
                        <span className="sidebar-row-actions">
                          <button className="sidebar-mini-action" onClick={(e) => startRenameProject(project.id, project.name, e)} title="重命名项目" type="button">✏</button>
                          <button className="sidebar-mini-action danger" onClick={(e) => removeProject(project.id, e)} title="删除项目" type="button">×</button>
                        </span>
                      </Link>
                    )
                  ))}

                  {addingTo === enterprise.id ? (
                    <div className="inline-add">
                      <input
                        className="inline-input"
                        autoFocus
                        placeholder="子类名称"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") addProject(enterprise.id);
                          if (e.key === "Escape") {
                            setAddingTo(null);
                            setNewName("");
                          }
                        }}
                      />
                      <button
                        className="inline-confirm"
                        onClick={() => addProject(enterprise.id)}
                        type="button"
                      >
                        ✓
                      </button>
                      <button
                        className="inline-cancel"
                        onClick={() => {
                          setAddingTo(null);
                          setNewName("");
                        }}
                        type="button"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <button
                      className="add-sub"
                      onClick={() => setAddingTo(enterprise.id)}
                      type="button"
                    >
                      + 新增子类
                    </button>
                  )}
                </div>
              </AnimateHeight>
            </div>
          );
        })}
      </div>

      <div className="sidebar-section-header">
        <span>对话</span>
      </div>

      <div className="history-groups">
        {workspace.enterprises.map((enterprise) => {
          const conversations = workspace.conversations.filter(
            (item) => item.enterpriseId === enterprise.id,
          );
          if (conversations.length === 0) return null;
          const isOpen = chatExpanded.has(enterprise.id);

          return (
            <section className="history-group" key={enterprise.id}>
              <button
                className="history-company"
                type="button"
                onClick={() => toggleChatGroup(enterprise.id)}
              >
                <span className={`tree-chevron ${isOpen ? "open" : ""}`}>▸</span>
                {enterprise.name}
              </button>
              <AnimateHeight open={isOpen}>
                {conversations.map((conversation) => (
                  renamingConversationId === conversation.id ? (
                    <div className="sidebar-rename-row history-rename-row" key={conversation.id}>
                      <input
                        className="inline-input"
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") submitConversationRename(conversation.id);
                          if (e.key === "Escape") cancelRename();
                        }}
                      />
                      <button className="inline-confirm" onClick={() => submitConversationRename(conversation.id)} type="button">✓</button>
                      <button className="inline-cancel" onClick={cancelRename} type="button">×</button>
                    </div>
                  ) : (
                    <button
                      className={`history-chat sidebar-editable-row ${pathname === `/chat/${conversation.id}` ? "active" : ""}`}
                      key={conversation.id}
                      type="button"
                      onClick={() => router.push(`/chat/${conversation.id}`)}
                    >
                      <span className="history-chat-title sidebar-row-title" title={conversation.title}>
                        {conversation.title.length > 8 ? conversation.title.slice(0, 8) + "…" : conversation.title}
                      </span>
                      <span className="sidebar-row-actions">
                        <span className="sidebar-mini-action" onClick={(e) => startRenameConversation(conversation.id, conversation.title, e)} title="重命名对话">✏</span>
                        <span className="sidebar-mini-action danger" onClick={(e) => removeConversation(conversation.id, e)} title="删除对话">×</span>
                      </span>
                    </button>
                  )
                ))}
              </AnimateHeight>
            </section>
          );
        })}
      </div>

      </div>{/* end sidebar-scroll */}

      <div className="spacer" />

      <div className="sidebar-footer">
        {user ? (
          <div className="sidebar-user-info">
            <div className="sidebar-user-top">
              <div className="sidebar-avatar">👤</div>
              <div className="sidebar-user-detail">
                <span className="sidebar-username">{user.displayName}</span>
                <span className="sidebar-user-role">{user.role === "admin" ? "管理员" : "成员"}</span>
              </div>
              <button className="sidebar-settings-btn" onClick={() => setSettingsOpen(true)} title="设置" type="button">⚙</button>
            </div>
            <button className="sidebar-logout-btn" onClick={() => { logout(); router.push("/login"); }} type="button">
              退出登录
            </button>
          </div>
        ) : (
          <button className="sidebar-login-link" onClick={() => router.push("/login")} type="button">
            👤 登录
          </button>
        )}
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="确认删除"
        message={`确定要删除${deleteTarget?.type === "project" ? "项目" : "对话"}「${deleteTarget?.name ?? ""}」吗？此操作不可撤销。`}
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </aside>
  );
}
