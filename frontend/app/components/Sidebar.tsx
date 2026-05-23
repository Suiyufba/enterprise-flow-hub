"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Workspace } from "shared";
import { fetchJson } from "../lib/api";

const fallbackWorkspace: Workspace = {
  enterprises: [],
  projects: [],
  conversations: [],
  libraryItems: [],
  plugins: [],
  automations: [],
};

export function Sidebar() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace>(fallbackWorkspace);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  async function refresh() {
    try {
      const data = await fetchJson<Workspace>("/workspace");
      setWorkspace(data);
      setExpanded(new Set(data.enterprises.map((e) => e.id)));
    } catch {
      setWorkspace(fallbackWorkspace);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function toggle(id: string) {
    setExpanded((prev) => {
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

  return (
    <aside className="sidebar">
      <div className="win-controls">
        <span className="win-dot red" />
        <span className="win-dot yellow" />
        <span className="win-dot green" />
      </div>

      <nav className="primary-nav" aria-label="主导航">
        <Link href="/" className="nav-item active">
          <span className="icon">✎</span> 新对话
        </Link>
        <Link href="/search" className="nav-item">
          <span className="icon">⌕</span> 搜索
        </Link>
        <Link href="/library" className="nav-item">
          <span className="icon">▣</span> 资料库
        </Link>
        <Link href="/plugins" className="nav-item">
          <span className="icon">⌘</span> 插件
        </Link>
        <Link href="/automation" className="nav-item">
          <span className="icon">◷</span> 自动化
        </Link>
      </nav>

      <div className="sidebar-section-header">
        <span>项目</span>
        <div className="sidebar-section-actions">
          <Link aria-label="新增企业" className="icon-action add-project-action" href="/projects/new">
            新增企业
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

              {isOpen && (
                <div className="sub-list">
                  {projects.map((project) => (
                    <Link
                      className="sub-item"
                      href={`/projects/${project.id}`}
                      key={project.id}
                    >
                      <span className="sub-item-icon">▱</span>
                      <span>{project.name}</span>
                    </Link>
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
              )}
            </div>
          );
        })}
      </div>

      <div className="section-label">对话</div>
      <div className="history-groups">
        {workspace.enterprises.map((enterprise) => {
          const conversations = workspace.conversations.filter(
            (item) => item.enterpriseId === enterprise.id,
          );
          if (conversations.length === 0) return null;
          return (
            <section className="history-group" key={enterprise.id}>
              <div className="history-company">{enterprise.name}</div>
              {conversations.map((conversation) => (
                <button
                  className="history-chat"
                  key={conversation.id}
                  type="button"
                  onClick={() =>
                    router.push(
                      `/projects/${conversation.projectId}?chat=${conversation.id}`,
                    )
                  }
                >
                  <span className="icon">💬</span>
                  {conversation.title}
                </button>
              ))}
            </section>
          );
        })}
      </div>

      <div className="spacer" />
      <div className="sidebar-footer">v0.1.0 MVP</div>
    </aside>
  );
}
