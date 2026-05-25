"use client";

import { useEffect, useState } from "react";
import type { AgentPersona, ModelProvider } from "shared";
import { fetchJson } from "../lib/api";
import "./SettingsModal.css";

type Tab = "providers" | "personas";

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("providers");
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [personas, setPersonas] = useState<AgentPersona[]>([]);
  const [loading, setLoading] = useState(false);

  // Provider form
  const [pName, setPName] = useState("");
  const [pBaseUrl, setPBaseUrl] = useState("");
  const [pModel, setPModel] = useState("");
  const [pKeyEnv, setPKeyEnv] = useState("");
  const [testingId, setTestingId] = useState("");
  const [testResults, setTestResults] = useState<Record<string, string>>({});

  // Persona form
  const [pRole, setPRole] = useState("");
  const [pDesc, setPDesc] = useState("");
  const [pPrompt, setPPrompt] = useState("");
  const [pProviderId, setPProviderId] = useState("");
  const [generatingPrompt, setGeneratingPrompt] = useState(false);

  async function refresh() {
    const [p, per] = await Promise.all([
      fetchJson<{ providers: ModelProvider[] }>("/settings/providers"),
      fetchJson<{ personas: AgentPersona[] }>("/settings/personas"),
    ]);
    setProviders(p.providers);
    setPersonas(per.personas);
  }

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  async function addProvider() {
    if (!pName.trim() || !pBaseUrl.trim() || !pModel.trim() || !pKeyEnv.trim()) return;
    setLoading(true);
    try {
      await fetchJson("/settings/providers", {
        method: "POST",
        body: JSON.stringify({ name: pName, baseUrl: pBaseUrl, model: pModel, apiKeyEnv: pKeyEnv }),
      });
      setPName(""); setPBaseUrl(""); setPModel(""); setPKeyEnv("");
      await refresh();
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function deleteProvider(id: string) {
    await fetchJson(`/settings/providers/${id}`, { method: "DELETE" });
    await refresh();
  }

  async function testProvider(id: string) {
    setTestingId(id);
    try {
      const res = await fetchJson<{ ok: boolean; message: string }>(`/settings/providers/${id}/test`, { method: "POST" });
      setTestResults((prev) => ({ ...prev, [id]: (res.ok ? "✅ " : "❌ ") + res.message }));
    } catch {
      setTestResults((prev) => ({ ...prev, [id]: "❌ 测试请求失败" }));
    }
    setTestingId("");
  }

  async function addPersona() {
    if (!pRole.trim() || !pDesc.trim() || !pPrompt.trim() || !pProviderId) return;
    try {
      await fetchJson("/settings/personas", {
        method: "POST",
        body: JSON.stringify({
          name: pRole, role: pRole, description: pDesc, systemPrompt: pPrompt, providerId: pProviderId,
        }),
      });
      setPRole(""); setPDesc(""); setPPrompt(""); setPProviderId("");
      await refresh();
    } catch { /* ignore */ }
  }

  async function deletePersona(id: string) {
    await fetchJson(`/settings/personas/${id}`, { method: "DELETE" });
    await refresh();
  }

  async function generatePrompt() {
    if (!pDesc.trim()) return;
    setGeneratingPrompt(true);
    try {
      const res = await fetchJson<{ prompt: string }>("/settings/generate-prompt", {
        method: "POST",
        body: JSON.stringify({ description: pDesc }),
      });
      setPPrompt(res.prompt);
    } catch {
      setPPrompt("生成失败，请手动填写。");
    }
    setGeneratingPrompt(false);
  }

  if (!open) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>设置</h2>
          <button className="settings-close" onClick={onClose} type="button">×</button>
        </div>

        <div className="settings-tabs">
          <button className={`settings-tab ${tab === "providers" ? "active" : ""}`} onClick={() => setTab("providers")}>模型账号</button>
          <button className={`settings-tab ${tab === "personas" ? "active" : ""}`} onClick={() => setTab("personas")}>角色人格</button>
        </div>

        {tab === "providers" && (
          <div className="settings-body">
            <div className="settings-form">
              <input className="page-input" value={pName} onChange={(e) => setPName(e.target.value)} placeholder="自定义名称，如：我的 DeepSeek" />
              <input className="page-input" value={pBaseUrl} onChange={(e) => setPBaseUrl(e.target.value)} placeholder="API 地址，如：https://api.deepseek.com" />
              <input className="page-input" value={pModel} onChange={(e) => setPModel(e.target.value)} placeholder="模型名称，如：deepseek-chat" />
              <input className="page-input" value={pKeyEnv} onChange={(e) => setPKeyEnv(e.target.value)} placeholder="环境变量名，如：DEEPSEEK_API_KEY" />
              <button className="page-primary-button" onClick={addProvider} disabled={loading} type="button">添加模型</button>
            </div>

            {providers.length === 0 && (
              <div className="search-empty">暂无模型账号，请添加</div>
            )}

            <div className="settings-list">
              {providers.map((p) => (
                <div className="settings-card" key={p.id}>
                  <div>
                    <strong>{p.name}</strong>
                    <span className="settings-meta">{p.model} @ {p.baseUrl}</span>
                    <span className={`settings-status ${p.configured ? "on" : "off"}`}>
                      {p.configured ? "已配置" : "未配置 Key"}
                    </span>
                  </div>
                  <div className="settings-card-actions">
                    <button className="page-secondary-button" onClick={() => testProvider(p.id)} disabled={testingId === p.id}>
                      {testingId === p.id ? "测试中..." : "测试连接"}
                    </button>
                    <button className="page-secondary-button" onClick={() => deleteProvider(p.id)}>删除</button>
                  </div>
                  {testResults[p.id] && (
                    <div className="settings-test-result">{testResults[p.id]}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "personas" && (
          <div className="settings-body">
            <div className="settings-form">
              <select className="page-input" value={pProviderId} onChange={(e) => setPProviderId(e.target.value)}>
                <option value="">选择模型...</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.model})</option>
                ))}
              </select>
              <input className="page-input" value={pRole} onChange={(e) => setPRole(e.target.value)} placeholder="角色名称，如：销售运营专家" />
              <input className="page-input" value={pDesc} onChange={(e) => setPDesc(e.target.value)} placeholder="角色说明，如：专注线索分配和转化漏斗分析" />
              <div className="settings-prompt-row">
                <textarea className="page-textarea" value={pPrompt} onChange={(e) => setPPrompt(e.target.value)} placeholder="System Prompt，或让 AI 帮你写" rows={3} />
                <button className="page-secondary-button settings-ai-btn" onClick={generatePrompt} disabled={generatingPrompt || !pDesc.trim()} type="button">
                  {generatingPrompt ? "生成中..." : "🤖 AI 生成 Prompt"}
                </button>
              </div>
              <button className="page-primary-button" onClick={addPersona} disabled={loading} type="button">添加角色</button>
            </div>

            {personas.length === 0 && (
              <div className="search-empty">暂无角色人格，请添加</div>
            )}

            <div className="settings-list">
              {personas.map((p) => (
                <div className="settings-card" key={p.id}>
                  <div>
                    <strong>{p.name}</strong>
                    <span className="settings-meta">{p.role} · {providers.find(x => x.id === p.providerId)?.name ?? "未知模型"}</span>
                    <span className={`settings-status ${p.enabled ? "on" : "off"}`}>
                      {p.enabled ? "已启用" : "已停用"}
                    </span>
                  </div>
                  <p className="settings-prompt-preview">{p.systemPrompt.slice(0, 120)}{p.systemPrompt.length > 120 ? "..." : ""}</p>
                  <div className="settings-card-actions">
                    <button className="page-secondary-button" onClick={() => deletePersona(p.id)}>删除</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
