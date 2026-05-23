import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Enterprise Flow Hub",
  description: "Screenshot-first AI workflow analyst",
};

export default function RootLayout({ children }: { children: ReactNode }) {
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

          <Link href="/" className="nav-item active">
            <span className="icon">✦</span> 新分析
          </Link>

          <div className="section-label">历史</div>
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
