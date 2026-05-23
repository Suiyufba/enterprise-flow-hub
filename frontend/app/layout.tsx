import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Enterprise Flow Hub",
  description: "Screenshot-first AI workflow analyst",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const projects = [
    "启航留学 / 线索增长",
    "启航留学 / 顾问日报",
    "云杉贸易 / 订单同步",
  ];

  const enterpriseGroups = [
    {
      name: "启航留学",
      conversations: ["线索跟进诊断", "顾问日报整理"],
    },
    {
      name: "云杉贸易",
      conversations: ["订单付款同步", "老板看板规划"],
    },
  ];

  return (
    <html lang="zh-CN">
      <body>
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
            <button className="nav-item" type="button">
              <span className="icon">⌕</span> 搜索
            </button>
            <button className="nav-item" type="button">
              <span className="icon">⌘</span> 插件
            </button>
            <button className="nav-item" type="button">
              <span className="icon">◷</span> 自动化
            </button>
          </nav>

          <div className="sidebar-section-header">
            <span>项目</span>
            <div className="sidebar-section-actions">
              <button aria-label="项目更多操作" className="icon-action" type="button">
                …
              </button>
              <button aria-label="新增项目" className="icon-action add-project-action" type="button">
                新增项目
              </button>
            </div>
          </div>

          <div className="project-list">
            {projects.map((item, index) => (
              <button className={`project-item ${index === 0 ? "active" : ""}`} key={item} type="button">
                <span className="project-item-icon">▱</span>
                <span>{item}</span>
              </button>
            ))}
          </div>

          <div className="section-label">对话</div>
          <div className="history-groups">
            {enterpriseGroups.map((group) => (
              <section className="history-group" key={group.name}>
                <div className="history-company">{group.name}</div>
                {group.conversations.map((conversation) => (
                  <button className="history-chat" key={conversation} type="button">
                    <span className="icon">💬</span>
                    {conversation}
                  </button>
                ))}
              </section>
            ))}
          </div>

          <div className="spacer" />
          <div className="sidebar-footer">v0.1.0 MVP</div>
        </aside>

        <main className="main">{children}</main>
      </body>
    </html>
  );
}
