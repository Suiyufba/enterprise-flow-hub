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
      setError(err instanceof Error ? err.message : "操作失败");
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
      {/* Background decoration */}
      <div className="login-bg" />

      <div className="login-card">
        <div className="login-header">
          <span className="login-brand">Enterprise Flow Hub</span>
          <p className="login-sub">企业流程自动化平台</p>
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

      </div>
    </div>
  );
}
