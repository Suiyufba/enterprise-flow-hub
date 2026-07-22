"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth-context";
import { ApiError, getSafeReturnTo } from "../lib/api";
import { animate } from "../lib/anime";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading: authLoading, login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function requestedDestination() {
    if (typeof window === "undefined") return "/";
    return getSafeReturnTo(new URLSearchParams(window.location.search).get("returnTo"), "/");
  }

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      router.replace(requestedDestination());
    }
  }, [authLoading, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await login(username.trim(), password);
      router.replace(requestedDestination());
    } catch (err) {
      let rawMsg = err instanceof Error ? err.message : "操作失败";
      if (err instanceof ApiError) {
        if (err.status === 401) rawMsg = "用户名或密码错误";
        else if (err.status === 403) rawMsg = "账号已被禁用";
        else if (err.status >= 500) rawMsg = "服务器暂时不可用，请稍后重试";
      }
      const errorMap: Record<string, string> = {
        NetworkError: "网络连接失败，请检查网络后重试",
        "Failed to fetch": "网络连接失败，请检查网络后重试",
        TypeError: "网络连接失败，请检查网络后重试",
        Unauthorized: "用户名或密码错误",
        "Invalid credentials": "用户名或密码错误",
        "401": "用户名或密码错误",
        "403": "账号已被禁用",
        "500": "服务器内部错误，请稍后重试",
      };
      let friendly = rawMsg;
      for (const [key, value] of Object.entries(errorMap)) {
        if (rawMsg.includes(key)) {
          friendly = value;
          break;
        }
      }
      setError(friendly);
      if (formRef.current) {
        animate(formRef.current, {
          x: [0, -8, 8, -6, 6, -4, 4, -2, 2, 0],
          duration: 500,
          ease: "inOutSine",
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading) {
    return (
      <div className="login-shell">
        <div className="loading">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="login-shell">
      <div className="login-bg" />

      <div className="login-panel">
        <section className="login-story" aria-label="Enterprise Flow Hub">
          <div className="login-mark">F</div>
          <p className="login-kicker">FlowHub</p>
          <h1>让 Agent 真正完成业务，而不只是回答问题。</h1>
          <p className="login-story-copy">客户、订单、发票、资料库与自动化在同一范围内协作。每一步可追踪、可确认、可回滚。</p>
          <div className="login-feature-grid">
            <span>业务数据</span>
            <span>Agent 执行</span>
            <span>自动化</span>
            <span>飞书协同</span>
          </div>
        </section>

        <div className="login-card">
          <div className="login-header">
            <span className="login-brand">欢迎回来</span>
            <p className="login-sub">登录后进入你的企业工作台</p>
          </div>

          <form ref={formRef} onSubmit={handleSubmit} className="login-form">
            <input
              className="login-input"
              type="text"
              placeholder="用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
              autoComplete="username"
              aria-label="用户名"
            />

            <input
              className="login-input"
              type="password"
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              aria-label="密码"
            />

            {error && <div className="login-error" role="alert" aria-live="polite">{error}</div>}

            <button
              className="login-submit"
              type="submit"
              disabled={submitting || !username.trim() || !password}
            >
              {submitting ? "登录中..." : "登录工作台"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
