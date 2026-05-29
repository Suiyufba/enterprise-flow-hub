"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";
import { PageTransition } from "./PageTransition";
import { useAuth } from "../lib/auth-context";

const SIDEBAR_KEY = "efh_sidebar_collapsed";

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
      <main className="main" style={{ paddingLeft: sidebarCollapsed ? 0 : 252 }}>
        <ThemeToggle />
        {isWorkflowEditorPage ? children : <PageTransition>{children}</PageTransition>}
      </main>
    </>
  );
}
