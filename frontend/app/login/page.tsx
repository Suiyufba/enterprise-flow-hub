"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading: authLoading, login, register } = useAuth();
  const { workspace } = useWorkspace();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [enterpriseId, setEnterpriseId] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (workspace.enterprises.length > 0 && !enterpriseId) {
      setEnterpriseId(workspace.enterprises[0].id);
    }
  }, [workspace.enterprises, enterpriseId]);

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
      if (mode === "login") {
        await login(username.trim(), password);
      } else {
        if (!displayName.trim()) {
          setError("请输入显示名称");
          setSubmitting(false);
          return;
        }
        await register({
          enterpriseId,
          username: username.trim(),
          password,
          displayName: displayName.trim(),
        });
      }
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

        {/* Tabs */}
        <div className="login-tabs">
          <button
            className={`login-tab ${mode === "login" ? "active" : ""}`}
            onClick={() => { setMode("login"); setError(""); }}
            type="button"
          >
            登录
          </button>
          <button
            className={`login-tab ${mode === "register" ? "active" : ""}`}
            onClick={() => { setMode("register"); setError(""); }}
            type="button"
          >
            注册
          </button>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {mode === "register" && (
            <select
              className="login-input"
              value={enterpriseId}
              onChange={(e) => setEnterpriseId(e.target.value)}
            >
              {workspace.enterprises.map((ent) => (
                <option key={ent.id} value={ent.id}>{ent.name}</option>
              ))}
            </select>
          )}

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

          {mode === "register" && (
            <input
              className="login-input"
              type="text"
              placeholder="显示名称（如：张总）"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          )}

          {error && <div className="login-error">{error}</div>}

          <button
            className="login-submit"
            type="submit"
            disabled={submitting || !username.trim() || !password}
          >
            {submitting ? "处理中..." : mode === "login" ? "登录" : "注册"}
          </button>
        </form>

        {mode === "login" && (
          <p className="login-hint">
            演示账号：<code>lina</code> 密码：<code>demo123</code>
          </p>
        )}
      </div>
    </div>
  );
}
