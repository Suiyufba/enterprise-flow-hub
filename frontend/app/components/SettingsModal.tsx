"use client";

import { useEffect, useState } from "react";
import type { AgentPersona, ModelProvider } from "shared";
import { fetchJson } from "../lib/api";
import { useToast } from "../lib/toast-context";
import "./SettingsModal.css";

type Tab = "providers" | "personas";

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>("providers");
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [personas, setPersonas] = useState<AgentPersona[]>([]);
  const [loading, setLoading] = useState(false);

  // Provider form
  const [pName, setPName] = useState("");
  const [pBaseUrl, setPBaseUrl] = useState("");
  const [pModel, setPModel] = useState("");
  const [pApiKey, setPApiKey] = useState("");
  const [testingId, setTestingId] = useState("");
  const [testResults, setTestResults] = useState<Record<string, string>>({});

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBaseUrl, setEditBaseUrl] = useState("");
  const [editModel, setEditModel] = useState("");
  const [editApiKey, setEditApiKey] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Model dropdown state
  const [addModels, setAddModels] = useState<string[]>([]);
  const [addFetchingModels, setAddFetchingModels] = useState(false);
  const [addShowDropdown, setAddShowDropdown] = useState(false);
  const [editModels, setEditModels] = useState<string[]>([]);
  const [editFetchingModels, setEditFetchingModels] = useState(false);
  const [editShowDropdown, setEditShowDropdown] = useState(false);

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

  // ---- Add provider ----
  async function addProvider() {
    if (!pName.trim() || !pBaseUrl.trim() || !pModel.trim() || !pApiKey.trim()) return;
    setLoading(true);
    try {
      await fetchJson("/settings/providers", {
        method: "POST",
        body: JSON.stringify({ name: pName, baseUrl: pBaseUrl, model: pModel, apiKey: pApiKey }),
      });
      setPName(""); setPBaseUrl(""); setPModel(""); setPApiKey("");
      setAddModels([]);
      await refresh();
    } catch { showToast("添加模型失败", "error"); }
    setLoading(false);
  }

  async function fetchAddModels() {
    if (!pBaseUrl.trim() || !pApiKey.trim()) return;
    setAddFetchingModels(true);
    setAddModels([]);
    try {
      const res = await fetchJson<{ models: string[] }>("/settings/fetch-models", {
        method: "POST",
        body: JSON.stringify({ baseUrl: pBaseUrl, apiKey: pApiKey }),
      });
      setAddModels(res.models);
      setAddShowDropdown(true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "获取模型列表失败", "error");
    }
    setAddFetchingModels(false);
  }

  async function deleteProvider(id: string) {
    await fetchJson(`/settings/providers/${id}`, { method: "DELETE" });
    await refresh();
  }

  async function testProvider(id: string) {
    setTestingId(id);
    try {
      const res = await fetchJson<{ ok: boolean; message: string }>(`/settings/providers/${id}/test`);
      setTestResults((prev) => ({ ...prev, [id]: (res.ok ? "✅ " : "❌ ") + res.message }));
    } catch {
      setTestResults((prev) => ({ ...prev, [id]: "❌ 测试请求失败" }));
    }
    setTestingId("");
  }

  // ---- Edit provider ----
  function startEdit(p: ModelProvider) {
    setEditingId(p.id);
    setEditName(p.name);
    setEditBaseUrl(p.baseUrl);
    setEditModel(p.model);
    setEditApiKey("");
    setEditModels([]);
    setEditShowDropdown(false);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit() {
    if (!editName.trim() || !editBaseUrl.trim() || !editModel.trim()) return;
    setEditSaving(true);
    try {
      const body: Record<string, string> = { name: editName, baseUrl: editBaseUrl, model: editModel };
      if (editApiKey.trim()) body.apiKey = editApiKey;
      await fetchJson(`/settings/providers/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setEditingId(null);
      await refresh();
      showToast("保存成功", "success");
    } catch { showToast("保存失败", "error"); }
    setEditSaving(false);
  }

  async function fetchEditModels() {
    if (!editingId) return;
    setEditFetchingModels(true);
    setEditModels([]);
    try {
      const res = await fetchJson<{ models: string[] }>(`/settings/providers/${editingId}/fetch-models`, {
        method: "POST",
      });
      setEditModels(res.models);
      setEditShowDropdown(true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "获取模型列表失败", "error");
    }
    setEditFetchingModels(false);
  }

  // ---- Personas ----
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
    } catch { showToast("添加角色失败", "error"); }
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
              <div className="settings-model-row">
                <input
                  className="page-input"
                  value={pModel}
                  onChange={(e) => { setPModel(e.target.value); setAddShowDropdown(false); }}
                  onFocus={() => { if (addModels.length > 0) setAddShowDropdown(true); }}
                  placeholder="模型名称，如：deepseek-chat"
                />
                <button
                  className="page-secondary-button settings-fetch-btn"
                  onClick={fetchAddModels}
                  disabled={addFetchingModels || !pBaseUrl.trim() || !pApiKey.trim()}
                  type="button"
                >
                  {addFetchingModels ? "获取中..." : "获取模型"}
                </button>
              </div>
              {addShowDropdown && addModels.length > 0 && (
                <ul className="settings-model-dropdown">
                  {addModels.map((m) => (
                    <li key={m} onClick={() => { setPModel(m); setAddShowDropdown(false); }}>
                      {m}
                    </li>
                  ))}
                </ul>
              )}
              <input className="page-input" value={pApiKey} onChange={(e) => setPApiKey(e.target.value)} placeholder="API Key，如：sk-xxxx" />
              <button className="page-primary-button" onClick={addProvider} disabled={loading} type="button">添加模型</button>
            </div>

            {providers.length === 0 && (
              <div className="search-empty">暂无模型账号，请添加</div>
            )}

            <div className="settings-list">
              {providers.map((p) => (
                <div className={`settings-card ${editingId === p.id ? "settings-card-editing" : ""}`} key={p.id}>
                  {editingId === p.id ? (
                    <div className="settings-edit-form">
                      <input className="page-input" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="自定义名称" />
                      <input className="page-input" value={editBaseUrl} onChange={(e) => setEditBaseUrl(e.target.value)} placeholder="API 地址" />
                      <div className="settings-model-row">
                        <input
                          className="page-input"
                          value={editModel}
                          onChange={(e) => { setEditModel(e.target.value); setEditShowDropdown(false); }}
                          onFocus={() => { if (editModels.length > 0) setEditShowDropdown(true); }}
                          placeholder="模型名称"
                        />
                        <button
                          className="page-secondary-button settings-fetch-btn"
                          onClick={fetchEditModels}
                          disabled={editFetchingModels}
                          type="button"
                        >
                          {editFetchingModels ? "获取中..." : "获取模型"}
                        </button>
                      </div>
                      {editShowDropdown && editModels.length > 0 && (
                        <ul className="settings-model-dropdown">
                          {editModels.map((m) => (
                            <li key={m} onClick={() => { setEditModel(m); setEditShowDropdown(false); }}>
                              {m}
                            </li>
                          ))}
                        </ul>
                      )}
                      <input className="page-input" value={editApiKey} onChange={(e) => setEditApiKey(e.target.value)} placeholder="API Key（留空不修改）" />
                      <div className="settings-card-actions">
                        <button className="page-primary-button" onClick={saveEdit} disabled={editSaving} type="button">
                          {editSaving ? "保存中..." : "保存"}
                        </button>
                        <button className="page-secondary-button" onClick={cancelEdit} type="button">取消</button>
                      </div>
                    </div>
                  ) : (
                    <>
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
                        <button className="page-secondary-button" onClick={() => startEdit(p)}>编辑</button>
                        <button className="page-secondary-button" onClick={() => deleteProvider(p.id)}>删除</button>
                      </div>
                    </>
                  )}
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
