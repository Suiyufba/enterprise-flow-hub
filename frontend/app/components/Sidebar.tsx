"use client";

import Link from "next/link";
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
  const [workspace, setWorkspace] = useState<Workspace>(fallbackWorkspace);

  useEffect(() => {
    fetchJson<Workspace>("/workspace")
      .then(setWorkspace)
      .catch(() => setWorkspace(fallbackWorkspace));
  }, []);

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
          <button aria-label="项目更多操作" className="icon-action" type="button">
            …
          </button>
          <Link aria-label="新增项目" className="icon-action add-project-action" href="/projects/new">
            新增项目
          </Link>
        </div>
      </div>

      <div className="project-list">
        {workspace.projects.map((project, index) => {
          const enterprise = workspace.enterprises.find((item) => item.id === project.enterpriseId);
          return (
            <Link
              className={`project-item ${index === 0 ? "active" : ""}`}
              href={`/projects/${project.id}`}
              key={project.id}
            >
              <span className="project-item-icon">▱</span>
              <span>{enterprise?.name ?? "未知企业"} / {project.name}</span>
            </Link>
          );
        })}
      </div>

      <div className="section-label">对话</div>
      <div className="history-groups">
        {workspace.enterprises.map((enterprise) => {
          const conversations = workspace.conversations.filter((item) => item.enterpriseId === enterprise.id);
          if (conversations.length === 0) return null;
          return (
            <section className="history-group" key={enterprise.id}>
              <div className="history-company">{enterprise.name}</div>
              {conversations.map((conversation) => (
                <button className="history-chat" key={conversation.id} type="button">
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

