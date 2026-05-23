"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { AnalysisResult, AnalysisRequest } from "shared";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function Home() {
  const router = useRouter();
  const [need, setNeed] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [tools, setTools] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFiles(selected: FileList | null) {
    if (!selected) return;
    const incoming = Array.from(selected).slice(0, 8);
    const merged = [...files, ...incoming].slice(0, 8);
    setFiles(merged);
    setPreviews(merged.map((f) => URL.createObjectURL(f)));
  }

  function removeFile(i: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
    setPreviews((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function submit() {
    if (!need.trim()) return;
    setLoading(true);
    setError("");

    try {
      const body: AnalysisRequest = {
        need: need.trim(),
        businessType: businessType || undefined,
        tools: tools || undefined,
        screenshotCount: files.length || 1,
      };

      const res = await fetch(`${API}/analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("分析失败，请重试");

      const data: AnalysisResult = await res.json();
      sessionStorage.setItem(`analysis:${data.id}`, JSON.stringify(data));
      router.push(`/results?id=${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "未知错误");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="main-inner">
        <div className="loading">
          <div className="spinner" />
          <p>AI 正在分析你的业务流程...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="main-inner">
      <h1 className="main-title">今天想分析什么流程？</h1>

      {/* Prompt Card */}
      <div className="prompt-card">
        <div className="prompt-main-row">
          <div className="prompt-left-actions">
            <button
              className="attach-btn"
              onClick={() => fileInputRef.current?.click()}
              title="上传截图"
            >
              +
            </button>
            <span className="access-badge">
              <span style={{ color: "#ff9500", fontSize: 10 }}>⚠</span>
              上传截图
            </span>
          </div>

          <div className="prompt-textarea-wrap">
            <textarea
              placeholder="描述你的业务需求..."
              rows={1}
              value={need}
              onChange={(e) => setNeed(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </div>

          <div className="prompt-right-actions">
            <span className="model-select">
              AI 分析
              <span style={{ fontSize: 9 }}>▾</span>
            </span>
            <button
              className="submit-btn"
              onClick={submit}
              disabled={!need.trim()}
              title="开始分析"
            >
              ↑
            </button>
          </div>
        </div>

        {/* Bottom row */}
        {files.length > 0 ? (
          <div className="prompt-bottom-row">
            <button className="mode-btn" onClick={() => fileInputRef.current?.click()}>
              <span>📸</span> 已添加 {files.length} 张截图
              <span style={{ fontSize: 9 }}>▾</span>
            </button>
            <span className="file-list">{files.map((f) => f.name).join(", ")}</span>
          </div>
        ) : (
          <div className="prompt-bottom-row">
            <button className="mode-btn" onClick={() => fileInputRef.current?.click()}>
              <span>📸</span> 添加截图
            </button>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Screenshot Previews */}
      {previews.length > 0 && (
        <div className="screenshot-previews">
          {previews.map((url, i) => (
            <div key={i} style={{ position: "relative" }}>
              <img src={url} alt={`Screenshot ${i + 1}`} className="screenshot-thumb" />
              <button
                onClick={() => removeFile(i)}
                style={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "#ff3b30",
                  color: "#fff",
                  border: "none",
                  fontSize: 12,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ color: "#d20f39", fontSize: 13, marginBottom: 12, textAlign: "center" }}>
          {error}
        </div>
      )}

      {/* Quick Start Cards */}
      <div className="cards-grid">
        <div className="action-card" onClick={() => fileInputRef.current?.click()}>
          <div className="card-icon purple">📸</div>
          <h3>上传业务截图</h3>
          <p>上传 Excel、CRM 页面或聊天记录，AI 自动识别流程</p>
        </div>
        <div className="action-card">
          <div className="card-icon blue">📋</div>
          <h3>选择模板场景</h3>
          <p>销售跟进、订单管理、客户服务等预设分析模板</p>
        </div>
        <div className="action-card">
          <div className="card-icon green">📊</div>
          <h3>查看诊断案例</h3>
          <p>留学中介的线索管理优化报告</p>
        </div>
      </div>

      {/* More Options */}
      <details className="more-options">
        <summary>更多选项</summary>
        <div className="more-fields">
          <select value={businessType} onChange={(e) => setBusinessType(e.target.value)}>
            <option value="">公司类型（可选）</option>
            <option value="留学/移民中介">留学/移民中介</option>
            <option value="教育培训">教育培训</option>
            <option value="企业服务">企业服务</option>
            <option value="电商">电商</option>
          </select>
          <input
            type="text"
            placeholder="当前使用的工具（可选）如：飞书、Excel"
            value={tools}
            onChange={(e) => setTools(e.target.value)}
          />
        </div>
      </details>
    </div>
  );
}
