"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { AnalysisResult } from "shared";
import { fetchJson } from "../lib/api";

function ResultsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get("id");
  const [data, setData] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    const cached = sessionStorage.getItem(`analysis:${id}`);
    if (cached) {
      setData(JSON.parse(cached));
      setLoading(false);
      return;
    }

    fetchJson<AnalysisResult>(`/analysis/${id}`)
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  async function exportResult(format: "markdown" | "json") {
    if (!id) return;
    const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    const res = await fetch(`${API}/analysis/${id}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format }),
    });
    if (!res.ok) return;
    const content = format === "json" ? await res.json() : await res.text();
    const body = typeof content === "string" ? content : JSON.stringify(content, null, 2);
    const mime = format === "markdown" ? "text/markdown" : "application/json";
    const ext = format === "markdown" ? "md" : "json";
    const blob = new Blob([body], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analysis-${id}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="results-inner">
        <div className="loading">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="results-inner">
        <p className="results-empty">未找到分析结果</p>
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button className="export-btn" onClick={() => router.push("/")}>
            ← 新建分析
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="results-inner">
      {/* Back + Title */}
      <div className="results-back">
        <button onClick={() => router.push("/")}>←</button>
        <h1>分析结果</h1>
      </div>

      {/* Summary */}
      <div className="result-card">
        <h2>{data.summary}</h2>
      </div>

      {/* Screenshot Types */}
      <div className="result-card">
        <h3>截图识别</h3>
        <div className="tag-list">
          {data.screenshotTypes.map((t) => (
            <span
              key={t}
              className={`tag ${t.includes("spreadsheet") ? "green" : t.includes("chat") ? "blue" : "purple"}`}
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Business Objects */}
      <div className="result-card">
        <h3>业务对象</h3>
        <div className="tag-list">
          {data.businessObjects.map((o) => (
            <span key={o} className="tag gray">
              {o}
            </span>
          ))}
        </div>
      </div>

      {/* Fields */}
      <div className="result-card">
        <h3>提取字段</h3>
        <div className="code-block">
          {data.fields.map((f) => (
            <div key={f.name}>
              <span className="key">&quot;{f.name}&quot;</span>:{" "}
              <span className="str">&quot;{f.label}&quot;</span> → {f.type}
              {f.missing && <span className="warn"> ⚠ missing</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Workflow Stages */}
      <div className="result-card">
        <h3>流程阶段</h3>
        <div className="stage-flow">
          {data.workflowStages.map((s, i) => (
            <span key={s}>
              {i > 0 && <span className="stage-arrow">→</span>}
              <span className="stage-item">{s}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Problems */}
      <div className="result-card">
        <h3 className="warn">⚠ 流程问题</h3>
        {data.problems.map((p, i) => (
          <div key={i} className="problem-item">
            ⚠ {p}
          </div>
        ))}
      </div>

      {/* Automation Rules */}
      <div className="result-card">
        <h3>🔔 自动化规则建议</h3>
        {data.automationRules.map((r, i) => (
          <div key={i} className="rule-item">
            🔔 IF {r.trigger} AND {r.condition} → {r.action}
          </div>
        ))}
      </div>

      {/* Dashboard Metrics */}
      <div className="result-card">
        <h3>📊 建议仪表盘指标</h3>
        <div className="tag-list">
          {data.dashboardMetrics.map((m) => (
            <span key={m} className="tag blue">
              {m}
            </span>
          ))}
        </div>
      </div>

      {/* Implementation Plan */}
      <div className="result-card">
        <h3>实施建议</h3>
        <ol className="result-ol">
          {data.implementationPlan.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </div>

      {/* Export */}
      <div className="export-bar">
        <button className="export-btn" onClick={() => exportResult("markdown")}>
          📥 Markdown 诊断报告
        </button>
        <button className="export-btn" onClick={() => exportResult("json")}>
          🔄 JSON 工作流规则
        </button>
      </div>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="results-inner">
          <div className="loading">
            <div className="spinner" />
          </div>
        </div>
      }
    >
      <ResultsContent />
    </Suspense>
  );
}
