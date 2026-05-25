"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth-context";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading: authLoading, login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      setError(err instanceof Error ? err.message : "操作失败");
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
      {/* Background decoration */}
      <div className="login-bg" />

      <div className="login-card">
        <div className="login-header">
          <span className="login-brand">Enterprise Flow Hub</span>
          <p className="login-sub">企业流程自动化平台</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <input
            className="login-input"
            type="text"
            placeholder="用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
          />

          <input
            className="login-input"
            type="password"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
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

        <p className="login-hint">
          演示账号：<code>admin</code> 密码：<code>demo123</code>
        </p>
      </div>
    </div>
  );
}
