import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Enterprise Flow Hub",
  description: "Screenshot-first AI workflow analyst",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <aside className="sidebar">
          <div className="win-controls">
            <span className="win-dot red" />
            <span className="win-dot yellow" />
            <span className="win-dot green" />
          </div>

          <a href="/" className="nav-item active">
            <span className="icon">✦</span> 新分析
          </a>

          <div className="section-label">历史</div>
          <div className="nav-item" style={{ color: "#aeaeb2", cursor: "default" }}>
            <span className="icon">💬</span> 暂无记录
          </div>

          <div className="spacer" />
          <div className="sidebar-footer">v0.1.0 MVP</div>
        </aside>

        <main className="main">{children}</main>
      </body>
    </html>
  );
}
