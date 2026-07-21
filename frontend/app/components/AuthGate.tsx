"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";
import { PageTransition } from "./PageTransition";
import { WorkspaceContextBar } from "./WorkspaceContextBar";
import { useAuth } from "../lib/auth-context";

const SIDEBAR_KEY = "efh_sidebar_collapsed";

const PAGE_TITLES: Record<string, string> = {
  "/": "工作台",
  "/chat/new": "新对话",
  "/search": "全局搜索",
  "/library": "资料库",
  "/plugins": "插件",
  "/automation": "自动化",
  "/personas": "角色人格",
  "/customers": "客户",
  "/suppliers": "供应商",
  "/products": "商品",
  "/orders": "订单",
  "/files": "文件",
  "/payments": "付款",
  "/invoices": "发票",
  "/tasks": "待办",
  "/rules": "规则引擎",
  "/enterprise": "企业管理",
  "/audit": "操作日志",
};

function getPageTitle(pathname: string) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (pathname.startsWith("/chat/")) return "业务对话";
  if (pathname.startsWith("/projects/")) return "项目详情";
  const base = `/${pathname.split("/").filter(Boolean)[0] ?? ""}`;
  return PAGE_TITLES[base] ?? "FlowHub";
}

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const isLoginPage = pathname === "/login";
  const isWorkflowEditorPage = pathname.startsWith("/automation/workflow");

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(SIDEBAR_KEY) === "1";
    } catch { return false; }
  });

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0"); } catch { /* noop */ }
      return next;
    });
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user && !isLoginPage) {
      router.replace("/login");
    }
    if (user && isLoginPage) {
      router.replace("/");
    }
  }, [isLoginPage, loading, router, user]);

  if (loading) {
    return (
      <main className="main main-auth-only">
        <div className="loading">
          <div className="spinner" />
        </div>
      </main>
    );
  }

  if (!user && !isLoginPage) {
    return (
      <main className="main main-auth-only">
        <div className="loading">
          <div className="spinner" />
        </div>
      </main>
    );
  }

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      <div className="mobile-app-bar" aria-hidden="true">
        <span className="mobile-app-mark">F</span>
        <span className="mobile-app-title">{getPageTitle(pathname)}</span>
      </div>
      <main className={`app-main ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <WorkspaceContextBar />
        <ThemeToggle />
        {isWorkflowEditorPage ? children : <PageTransition>{children}</PageTransition>}
      </main>
    </>
  );
}
