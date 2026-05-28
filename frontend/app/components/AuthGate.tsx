"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";
import { PageTransition } from "./PageTransition";
import { useAuth } from "../lib/auth-context";

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const isLoginPage = pathname === "/login";

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
      <Sidebar />
      <main className="main">
        <ThemeToggle />
        <PageTransition>{children}</PageTransition>
      </main>
    </>
  );
}
