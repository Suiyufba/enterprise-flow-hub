"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth-context";
import { animate } from "../lib/anime";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading: authLoading, login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/");
    }
  }, [authLoading, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await login(username.trim(), password);
      router.replace("/");
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : "操作失败";
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
          <div className="login-mark">EF</div>
          <p className="login-kicker">Enterprise Flow Hub</p>
          <h1>把客户、订单、发票和自动化放进同一个工作流。</h1>
          <p className="login-story-copy">面向管理团队的企业流程中枢，统一跟踪业务数据、文件资料和 AI 协作记录。</p>
          <div className="login-feature-grid">
            <span>订单</span>
            <span>发票</span>
            <span>付款</span>
            <span>审计</span>
          </div>
        </section>

        <div className="login-card">
          <div className="login-header">
            <span className="login-brand">登录工作台</span>
            <p className="login-sub">使用企业账号继续访问</p>
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
            />

            <input
              className="login-input"
              type="password"
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />

            {error && <div className="login-error">{error}</div>}

            <button
              className="login-submit"
              type="submit"
              disabled={submitting || !username.trim() || !password}
            >
              {submitting ? "登录中..." : "登录"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
