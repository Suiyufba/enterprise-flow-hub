"use client";

import { useRef } from "react";
import Link from "next/link";
import { useAuth } from "./lib/auth-context";
import { useWorkspace } from "./lib/workspace-context";
import { StatCard } from "./components/StatCard";
import { gsap, useGSAP } from "./lib/gsap";

export default function DashboardPage() {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const pageRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap.from(pageRef.current, { y: 24, autoAlpha: 0, duration: 0.5, ease: "power3.out" });
    gsap.from(".stat-card", { y: 16, autoAlpha: 0, duration: 0.4, stagger: 0.07, ease: "power3.out", delay: 0.1 });
    gsap.from(".dashboard-card", { y: 12, autoAlpha: 0, duration: 0.35, stagger: 0.08, ease: "power3.out", delay: 0.2 });
  }, { scope: pageRef });

  const enterpriseId = user?.enterpriseId ?? workspace.enterprises[0]?.id;
  const enterpriseProjects = workspace.projects.filter((p) => p.enterpriseId === enterpriseId);
  const enterpriseConversations = workspace.conversations.filter((c) => c.enterpriseId === enterpriseId);

  return (
    <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
      <div className="page-shell" ref={pageRef}>
        <div className="page-header">
          <div className="page-header-left">
            <h1>仪表盘</h1>
            <p>
              欢迎回来{user ? `，${user.displayName}` : ""}
              {workspace.enterprises.find((e) => e.id === enterpriseId)
                ? ` — ${workspace.enterprises.find((e) => e.id === enterpriseId)!.name}`
                : ""}
            </p>
          </div>
        </div>

        <div className="dashboard-grid">
          <StatCard label="项目" value={enterpriseProjects.length} icon="📁" />
          <StatCard label="对话" value={enterpriseConversations.length} icon="💬" />
          <StatCard
            label="资料库"
            value={workspace.libraryItems.filter((l) => l.enterpriseId === enterpriseId).length}
            icon="📚"
          />
          <StatCard
            label="自动化"
            value={workspace.automations.filter((a) => {
              const proj = workspace.projects.find((p) => p.id === a.projectId);
              return proj?.enterpriseId === enterpriseId;
            }).length}
            icon="⚡"
          />
        </div>

        <div className="dashboard-cards">
          <div className="dashboard-card">
            <h3>快速操作</h3>
            <div className="dashboard-actions">
              <Link href="/chat/new" className="dashboard-action-btn">
                <span>✎</span> 新建对话
              </Link>
              <Link href="/projects/new" className="dashboard-action-btn">
                <span>+</span> 新建项目
              </Link>
              <Link href="/library" className="dashboard-action-btn">
                <span>▣</span> 上传资料
              </Link>
              <Link href="/search" className="dashboard-action-btn">
                <span>⌕</span> 全局搜索
              </Link>
            </div>
          </div>

          <div className="dashboard-card">
            <h3>最近对话</h3>
            <div className="dashboard-recent-list">
              {enterpriseConversations.slice(0, 5).length === 0 ? (
                <p style={{ color: "var(--c-8c8c8c)", fontSize: "13px", padding: "8px 0" }}>
                  还没有对话，开始一个新对话吧
                </p>
              ) : (
                enterpriseConversations
                  .slice(0, 5)
                  .map((conv) => (
                    <Link
                      key={conv.id}
                      href={`/chat/${conv.id}`}
                      className="dashboard-recent-item"
                    >
                      <span style={{ fontSize: "12px", color: "var(--c-8c8c8c)" }}>💬</span>
                      <span className="item-title">{conv.title}</span>
                      <span className="item-time">
                        {conv.createdAt?.slice(0, 10)}
                      </span>
                    </Link>
                  ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
