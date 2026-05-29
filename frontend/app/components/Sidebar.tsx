"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { fetchJson } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import { useToast } from "../lib/toast-context";
import { ConfirmDialog } from "./ConfirmDialog";
import { SettingsModal } from "./SettingsModal";
import { AnimateHeight } from "./AnimateHeight";
import { animate, spring } from "../lib/anime";

type SidebarIconName =
  | "dashboard" | "chat" | "search" | "library" | "plugins" | "automation" | "personas" | "check" | "x"
  | "customers" | "suppliers" | "products" | "orders" | "files" | "payments" | "invoices"
  | "rules" | "enterprise" | "audit" | "project" | "edit" | "delete" | "settings" | "user" | "logout";

const iconPaths: Record<SidebarIconName, string[]> = {
  dashboard: ["M4 5h7v7H4z", "M13 5h7v4h-7z", "M13 11h7v8h-7z", "M4 14h7v5H4z"],
  chat: ["M5 6h14v10H8l-3 3z", "M8 9h8", "M8 12h5"],
  search: ["M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13Z", "M15.5 15.5 20 20"],
  library: ["M5 4h11a3 3 0 0 1 3 3v13H7a2 2 0 0 1-2-2z", "M7 16h12", "M8 8h7"],
  plugins: ["M9 4v4", "M15 4v4", "M7 8h10v5a5 5 0 0 1-10 0z", "M12 18v3"],
  automation: ["M13 3 5 14h6l-1 7 8-11h-6z"],
  check: ["M5 12.5 10 17 19 7"],
  personas: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M4 20a8 8 0 0 1 16 0"],
  customers: ["M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", "M17 12a3 3 0 1 0 0-6", "M3 20a6 6 0 0 1 12 0", "M14 20a5 5 0 0 1 7-4.6"],
  suppliers: ["M4 20V8l6-4v16", "M10 10l6-4v14", "M4 20h16", "M7 13h1", "M13 13h1", "M17 13h1"],
  products: ["M4 8 12 4l8 4-8 4z", "M4 8v8l8 4 8-4V8", "M12 12v8"],
  orders: ["M7 4h10l2 2v14H5V6z", "M8 9h8", "M8 13h8", "M8 17h5"],
  files: ["M7 3h7l5 5v13H7z", "M14 3v6h5", "M9 14h6", "M9 17h4"],
  payments: ["M4 7h16v10H4z", "M4 10h16", "M8 15h3"],
  invoices: ["M7 3h10v18l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2z", "M9 8h6", "M9 12h6", "M9 16h4"],
  rules: ["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", "M12 4v2", "M12 18v2", "M4 12h2", "M18 12h2", "M6.6 6.6 8 8", "M16 16l1.4 1.4", "M17.4 6.6 16 8", "M8 16l-1.4 1.4"],
  enterprise: ["M4 20V5h9v15", "M13 10h7v10", "M7 8h2", "M7 12h2", "M7 16h2", "M16 13h1", "M16 17h1"],
  audit: ["M6 4h12v16H6z", "M9 8h6", "M9 12h6", "M9 16h4"],
  project: ["M5 7h5l2 3h7v9H5z"],
  edit: ["M5 19l4-.8L18.5 8.7a2.1 2.1 0 0 0-3-3L6 15.2z", "M14 7l3 3"],
  delete: ["M6 7h12", "M9 7V5h6v2", "M8 10l1 9h6l1-9"],
  settings: ["M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "M19 12h2", "M3 12h2", "M12 3v2", "M12 19v2", "M17 5.6l-1.4 1.4", "M8.4 17 7 18.4", "M7 5.6 8.4 7", "M15.6 17l1.4 1.4"],
  user: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M5 20a7 7 0 0 1 14 0"],
  logout: ["M9 5H5v14h4", "M14 8l4 4-4 4", "M18 12H9"],
  x: ["M6 6l12 12", "M18 6 6 18"],
};

function SidebarIcon({ name, className = "" }: { name: SidebarIconName; className?: string }) {
  return (
    <svg className={`sidebar-svg-icon ${className}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {iconPaths[name].map((path) => <path key={path} d={path} />)}
    </svg>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const { workspace, refresh } = useWorkspace();
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const navRef = useRef<HTMLElement>(null);
  const [chatExpanded, setChatExpanded] = useState<Set<string>>(new Set());
  const [navGroups, setNavGroups] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("efh_nav_groups");
      return saved ? new Set(JSON.parse(saved)) : new Set(["ai-tools"]);
    } catch {
      return new Set(["ai-tools"]);
    }
  });

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const active = nav.querySelector(".nav-item.active") as HTMLElement | null;
    if (!active) return;
    const navRect = nav.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const indicator = nav.querySelector(".nav-indicator") as HTMLElement | null;
    if (!indicator) return;
    animate(indicator, {
      top: activeRect.top - navRect.top,
      height: activeRect.height,
      duration: 350,
      ease: "outExpo",
    });
  }, [pathname]);

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
    <>
      <button
        className={`sidebar-toggle ${collapsed ? "collapsed" : ""}`}
        onClick={onToggle}
        type="button"
        aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
        title={collapsed ? "展开侧栏" : "收起侧栏"}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {collapsed ? (
            <path d="M9 18l6-6-6-6" />
          ) : (
            <path d="M15 18l-6-6 6-6" />
          )}
        </svg>
      </button>
      <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
        <div className="sidebar-scroll">
      <nav className="primary-nav" ref={navRef} aria-label="主导航">
          <div className="nav-indicator" />
        <Link href="/" className={`nav-item ${pathname === "/" ? "active" : ""}`}>
          <SidebarIcon name="dashboard" /> 仪表盘
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
              <SidebarIcon name="chat" /> 新对话
            </Link>
            <Link href="/search" className={`nav-item ${pathname === "/search" ? "active" : ""}`}>
              <SidebarIcon name="search" /> 搜索
            </Link>
            <Link href="/library" className={`nav-item ${pathname === "/library" ? "active" : ""}`}>
              <SidebarIcon name="library" /> 资料库
            </Link>
            <Link href="/plugins" className={`nav-item ${pathname === "/plugins" ? "active" : ""}`}>
              <SidebarIcon name="plugins" /> 插件
            </Link>
            <Link href="/automation" className={`nav-item ${pathname === "/automation" ? "active" : ""}`}>
              <SidebarIcon name="automation" /> 自动化
            </Link>
            <Link href="/personas" className={`nav-item ${pathname === "/personas" ? "active" : ""}`}>
              <SidebarIcon name="personas" /> 人格
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
              <SidebarIcon name="customers" /> 客户
            </Link>
            <Link href="/suppliers" className={`nav-item ${pathname === "/suppliers" ? "active" : ""}`}>
              <SidebarIcon name="suppliers" /> 供应商
            </Link>
            <Link href="/products" className={`nav-item ${pathname === "/products" ? "active" : ""}`}>
              <SidebarIcon name="products" /> 商品
            </Link>
            <Link href="/orders" className={`nav-item ${pathname?.startsWith("/orders") ? "active" : ""}`}>
              <SidebarIcon name="orders" /> 订单
            </Link>
            <Link href="/files" className={`nav-item ${pathname?.startsWith("/files") ? "active" : ""}`}>
              <SidebarIcon name="files" /> 文件
            </Link>
            <Link href="/payments" className={`nav-item ${pathname?.startsWith("/payments") ? "active" : ""}`}>
              <SidebarIcon name="payments" /> 付款
            </Link>
            <Link href="/invoices" className={`nav-item ${pathname?.startsWith("/invoices") ? "active" : ""}`}>
              <SidebarIcon name="invoices" /> 发票
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
            <Link href="/rules" className={`nav-item ${pathname === "/rules" ? "active" : ""}`}>
              <SidebarIcon name="rules" /> 规则引擎
            </Link>
            {user?.role === "admin" && (
              <>
                <Link href="/enterprise" className={`nav-item ${pathname === "/enterprise" ? "active" : ""}`}>
                  <SidebarIcon name="enterprise" /> 企业管理
                </Link>
                <Link href="/audit" className={`nav-item ${pathname === "/audit" ? "active" : ""}`}>
                  <SidebarIcon name="audit" /> 操作日志
                </Link>
              </>
            )}
          </div>
        )}
      </nav>

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
                        <button className="inline-confirm" onClick={() => submitProjectRename(project.id)} type="button"><SidebarIcon name="check" /></button>
                        <button className="inline-cancel" onClick={cancelRename} type="button"><SidebarIcon name="x" /></button>
                      </div>
                    ) : (
                      <Link
                        className={`sub-item sidebar-editable-row ${pathname === `/projects/${project.id}` ? "active" : ""}`}
                        href={`/projects/${project.id}`}
                        key={project.id}
                      >
                        <SidebarIcon name="project" className="sub-item-icon" />
                        <span className="sidebar-row-title">{project.name}</span>
                        <span className="sidebar-row-actions">
                          <button className="sidebar-mini-action" onClick={(e) => startRenameProject(project.id, project.name, e)} title="重命名项目" type="button"><SidebarIcon name="edit" /></button>
                          <button className="sidebar-mini-action danger" onClick={(e) => removeProject(project.id, e)} title="删除项目" type="button"><SidebarIcon name="delete" /></button>
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
                        <SidebarIcon name="check" />
                      </button>
                      <button
                        className="inline-cancel"
                        onClick={() => {
                          setAddingTo(null);
                          setNewName("");
                        }}
                        type="button"
                      >
                        <SidebarIcon name="x" />
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
                      <button className="inline-confirm" onClick={() => submitConversationRename(conversation.id)} type="button"><SidebarIcon name="check" /></button>
                      <button className="inline-cancel" onClick={cancelRename} type="button"><SidebarIcon name="x" /></button>
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
                        <span className="sidebar-mini-action" onClick={(e) => startRenameConversation(conversation.id, conversation.title, e)} title="重命名对话"><SidebarIcon name="edit" /></span>
                        <span className="sidebar-mini-action danger" onClick={(e) => removeConversation(conversation.id, e)} title="删除对话"><SidebarIcon name="delete" /></span>
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
              <div className="sidebar-avatar"><SidebarIcon name="user" /></div>
              <div className="sidebar-user-detail">
                <span className="sidebar-username">{user.displayName}</span>
                <span className="sidebar-user-role">{user.role === "admin" ? "管理员" : "成员"}</span>
              </div>
              <button className="sidebar-settings-btn" onClick={() => setSettingsOpen(true)} title="设置" type="button"><SidebarIcon name="settings" /></button>
            </div>
            <button className="sidebar-logout-btn" onClick={() => { logout(); router.push("/login"); }} type="button">
              <SidebarIcon name="logout" /> 退出登录
            </button>
          </div>
        ) : (
          <button className="sidebar-login-link" onClick={() => router.push("/login")} type="button">
            <SidebarIcon name="user" /> 登录
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
    </>
  );
}
