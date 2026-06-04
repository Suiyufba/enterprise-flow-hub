"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentPersona, ModelProvider } from "shared";
import { fetchJson } from "../lib/api";
import { useToast } from "../lib/toast-context";
import { animate, spring } from "../lib/anime";
import "./SettingsModal.css";

type Tab = "providers" | "personas" | "agent";

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { showToast } = useToast();
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !overlayRef.current || !contentRef.current) return;
    animate(overlayRef.current, {
      opacity: [0, 1],
      duration: 250,
      ease: "outCubic",
    });
    animate(contentRef.current, {
      scale: [0.9, 1],
      y: [10, 0],
      opacity: [0, 1],
      duration: 500,
      ease: spring({ mass: 1, stiffness: 80, damping: 12, velocity: 0 }),
    });
  }, [open]);

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
  const [pThinkingProviderId, setPThinkingProviderId] = useState("");
  const [generatingPrompt, setGeneratingPrompt] = useState(false);

  // Persona edit state
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null);
  const [epName, setEpName] = useState("");
  const [epRole, setEpRole] = useState("");
  const [epDesc, setEpDesc] = useState("");
  const [epPrompt, setEpPrompt] = useState("");
  const [epProviderId, setEpProviderId] = useState("");
  const [epThinkingProviderId, setEpThinkingProviderId] = useState("");
  const [epSaving, setEpSaving] = useState(false);

  // Agent kernel status
  const [agentStatus, setAgentStatus] = useState<{
    runtime: string;
    fallbackRuntime: string;
    hermes: { connected: boolean; version?: string; model?: string; url: string };
    enabledUserIds: string | null;
  } | null>(null);
  const [agentStatusLoading, setAgentStatusLoading] = useState(false);
  const [agentStatusError, setAgentStatusError] = useState("");

  async function loadAgentStatus() {
    setAgentStatusLoading(true);
    setAgentStatusError("");
    try {
      const agent = await fetchJson<{
        runtime: string; fallbackRuntime: string;
        hermes: { connected: boolean; version?: string; model?: string; url: string };
        enabledUserIds: string | null;
      }>("/agent/status");
      setAgentStatus(agent);
    } catch {
      setAgentStatus(null);
      setAgentStatusError("Agent 状态加载失败，请重试");
    } finally {
      setAgentStatusLoading(false);
    }
  }

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

  useEffect(() => {
    if (open && tab === "agent") void loadAgentStatus();
  }, [open, tab]);

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
      setTestResults((prev) => ({ ...prev, [id]: `${res.ok ? "通过" : "失败"}：${res.message}` }));
    } catch {
      setTestResults((prev) => ({ ...prev, [id]: "失败：测试请求失败" }));
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
      const body: Record<string, string> = {
        name: pRole, role: pRole, description: pDesc, systemPrompt: pPrompt, providerId: pProviderId,
      };
      if (pThinkingProviderId) body.thinkingProviderId = pThinkingProviderId;
      await fetchJson("/settings/personas", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setPRole(""); setPDesc(""); setPPrompt(""); setPProviderId(""); setPThinkingProviderId("");
      await refresh();
    } catch { showToast("添加角色失败", "error"); }
  }

  async function deletePersona(id: string) {
    await fetchJson(`/settings/personas/${id}`, { method: "DELETE" });
    await refresh();
  }

  function startEditPersona(p: AgentPersona) {
    setEditingPersonaId(p.id);
    setEpName(p.name);
    setEpRole(p.role);
    setEpDesc(p.description);
    setEpPrompt(p.systemPrompt);
    setEpProviderId(p.providerId);
    setEpThinkingProviderId(p.thinkingProviderId || "");
  }

  function cancelEditPersona() {
    setEditingPersonaId(null);
  }

  async function saveEditPersona() {
    if (!epName.trim() || !epRole.trim() || !epPrompt.trim() || !epProviderId) return;
    setEpSaving(true);
    try {
      const body: Record<string, string> = {
        name: epName, role: epRole, description: epDesc, systemPrompt: epPrompt, providerId: epProviderId,
      };
      if (epThinkingProviderId) body.thinkingProviderId = epThinkingProviderId;
      await fetchJson(`/settings/personas/${editingPersonaId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setEditingPersonaId(null);
      await refresh();
      showToast("保存成功", "success");
    } catch { showToast("保存失败", "error"); }
    setEpSaving(false);
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
    <div className="settings-overlay" onClick={onClose} ref={overlayRef}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()} ref={contentRef}>
        <div className="settings-header">
          <h2>设置</h2>
          <button className="settings-close" onClick={onClose} type="button">×</button>
        </div>

        <div className="settings-tabs">
          <button className={`settings-tab ${tab === "providers" ? "active" : ""}`} onClick={() => setTab("providers")} type="button">模型账号</button>
          <button className={`settings-tab ${tab === "agent" ? "active" : ""}`} onClick={() => setTab("agent")} type="button">Agent 内核</button>
        </div>

        {tab === "agent" && (
          <div className="settings-body">
            <div className="settings-form">
              <h3 style={{ margin: "0 0 12px", fontSize: "1rem", fontWeight: 600 }}>Agent 运行时状态</h3>
              {agentStatusLoading ? (
                <div className="search-empty">正在加载 Agent 状态...</div>
              ) : agentStatus ? (
                <div className="settings-list">
                  <div className="settings-card">
                    <div>
                      <strong>当前运行时</strong>
                      <span className="settings-meta">
                        {agentStatus.runtime === "hermes" ? "Hermes-Agent" : "Legacy（内置 Kernel）"}
                      </span>
                    </div>
                    <span className={`settings-status ${agentStatus.runtime === "hermes" ? "on" : "off"}`}>
                      {agentStatus.runtime === "hermes" ? "Hermes" : "Legacy"}
                    </span>
                  </div>
                  <div className="settings-card">
                    <div>
                      <strong>回退运行时</strong>
                      <span className="settings-meta">
                        {agentStatus.fallbackRuntime === "hermes" ? "Hermes-Agent" : "Legacy（内置 Kernel）"}
                      </span>
                    </div>
                    <span className="settings-meta">Hermes 不可用时自动切换</span>
                  </div>
                  <div className="settings-card">
                    <div>
                      <strong>Hermes 连接状态</strong>
                      <span className="settings-meta">
                        {agentStatus.hermes.connected ? "已连接" : "未连接"}
                        {agentStatus.hermes.version ? ` · v${agentStatus.hermes.version}` : ""}
                        {agentStatus.hermes.model ? ` · ${agentStatus.hermes.model}` : ""}
                      </span>
                    </div>
                    <span className={`settings-status ${agentStatus.hermes.connected ? "on" : "off"}`}>
                      {agentStatus.hermes.connected ? "● 在线" : "○ 离线"}
                    </span>
                  </div>
                  <div className="settings-card">
                    <div>
                      <strong>Hermes 服务地址</strong>
                      <span className="settings-meta">{agentStatus.hermes.url}</span>
                    </div>
                  </div>
                  <div className="settings-card">
                    <div>
                      <strong>灰度用户</strong>
                      <span className="settings-meta">
                        {agentStatus.enabledUserIds
                          ? agentStatus.enabledUserIds.split(",").join(", ")
                          : "全量（所有用户使用当前运行时）"}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="search-empty">
                  <p>{agentStatusError || "暂无 Agent 状态"}</p>
                  <button className="page-secondary-button" onClick={() => void loadAgentStatus()} type="button">
                    重新加载
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

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


      </div>
    </div>
  );
}
