"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AgentModelConfig, ModelProvider } from "shared";
import { fetchJson } from "../lib/api";
import { useToast } from "../lib/toast-context";
import { animate, spring } from "../lib/anime";
import { AppIcon } from "./AppIcon";
import { ConfirmDialog } from "./ConfirmDialog";
import "./SettingsModal.css";

type Tab = "providers" | "agent";

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

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const [tab, setTab] = useState<Tab>("providers");
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [agentConfigs, setAgentConfigs] = useState<AgentModelConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [configName, setConfigName] = useState("");
  const [thinkingProviderId, setThinkingProviderId] = useState("");
  const [executorProviderId, setExecutorProviderId] = useState("");
  const [embeddingProviderId, setEmbeddingProviderId] = useState("");
  const [configSaving, setConfigSaving] = useState(false);

  // Provider form
  const [pType, setPType] = useState<ModelProvider["type"]>("chat");
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
  const [providerToDelete, setProviderToDelete] = useState<ModelProvider | null>(null);
  const [deletingProvider, setDeletingProvider] = useState(false);

  // Model dropdown state
  const [addModels, setAddModels] = useState<string[]>([]);
  const [addFetchingModels, setAddFetchingModels] = useState(false);
  const [addShowDropdown, setAddShowDropdown] = useState(false);
  const [editModels, setEditModels] = useState<string[]>([]);
  const [editFetchingModels, setEditFetchingModels] = useState(false);
  const [editShowDropdown, setEditShowDropdown] = useState(false);

  // Agent kernel status
  const [agentStatus, setAgentStatus] = useState<{
    runtime: string;
    fallbackRuntime: string;
    activeRuntime: string;
    claudeCode: { connected: boolean; version?: string; model?: string; executable: string };
  } | null>(null);
  const [agentStatusLoading, setAgentStatusLoading] = useState(false);
  const [agentStatusError, setAgentStatusError] = useState("");

  async function loadAgentStatus() {
    setAgentStatusLoading(true);
    setAgentStatusError("");
    try {
      const agent = await fetchJson<{
        runtime: string; fallbackRuntime: string; activeRuntime: string;
        claudeCode: { connected: boolean; version?: string; model?: string; executable: string };
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
    const [p, c] = await Promise.all([
      fetchJson<{ providers: ModelProvider[] }>("/settings/providers"),
      fetchJson<{ configs: AgentModelConfig[] }>("/settings/agent-model-configs"),
    ]);
    setProviders(p.providers);
    setAgentConfigs(c.configs);
  }

  useEffect(() => {
    const chat = providers.filter((provider) => provider.type === "chat" && provider.enabled && provider.configured);
    const embedding = providers.filter((provider) => provider.type === "embedding" && provider.enabled && provider.configured);
    if (!thinkingProviderId && chat[0]) setThinkingProviderId(chat[0].id);
    if (!executorProviderId && chat[0]) setExecutorProviderId(chat[0].id);
    if (!embeddingProviderId && embedding[0]) setEmbeddingProviderId(embedding[0].id);
  }, [providers, thinkingProviderId, executorProviderId, embeddingProviderId]);

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
        body: JSON.stringify({
          name: pName,
          type: pType,
          baseUrl: pBaseUrl,
          model: pModel,
          apiKey: pApiKey,
        }),
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

  async function createAgentConfig() {
    if (!configName.trim() || !thinkingProviderId || !executorProviderId || !embeddingProviderId) {
      showToast("请填写配置名称，并选择 Think、Executor 和 Embedding 模型", "error");
      return;
    }
    setConfigSaving(true);
    try {
      await fetchJson("/settings/agent-model-configs", {
        method: "POST",
        body: JSON.stringify({ name: configName, thinkingProviderId, executorProviderId, embeddingProviderId }),
      });
      setConfigName("");
      await refresh();
      showToast("Agent 配置已创建", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "创建配置失败", "error");
    } finally {
      setConfigSaving(false);
    }
  }

  async function activateAgentConfig(id: string) {
    setConfigSaving(true);
    try {
      await fetchJson(`/settings/agent-model-configs/${id}/activate`, { method: "POST" });
      await refresh();
      showToast("已切换 Agent 运行配置", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "切换配置失败", "error");
    } finally {
      setConfigSaving(false);
    }
  }

  async function removeAgentConfig(id: string) {
    setConfigSaving(true);
    try {
      await fetchJson(`/settings/agent-model-configs/${id}`, { method: "DELETE" });
      await refresh();
      showToast("配置已删除", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "删除配置失败", "error");
    } finally {
      setConfigSaving(false);
    }
  }

  function providerLabel(id: string) {
    const provider = providers.find((item) => item.id === id);
    if (!provider) return "模型已移除";
    return `${provider.name} · ${provider.model}`;
  }

  async function deleteProvider() {
    if (!providerToDelete) return;
    setDeletingProvider(true);
    try {
      await fetchJson(`/settings/providers/${providerToDelete.id}`, { method: "DELETE" });
      setProviderToDelete(null);
      await refresh();
      showToast("模型账号已删除", "success");
    } catch {
      showToast("模型账号删除失败，可能仍被角色或工作流使用", "error");
    } finally {
      setDeletingProvider(false);
    }
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

  async function testEmbeddingProvider(id: string) {
    setTestingId(`${id}:embedding`);
    try {
      const res = await fetchJson<{ ok: boolean; message: string }>(`/settings/providers/${id}/test-embedding`);
      setTestResults((prev) => ({ ...prev, [id]: `向量${res.ok ? "通过" : "失败"}：${res.message}` }));
    } catch {
      setTestResults((prev) => ({ ...prev, [id]: "向量失败：测试请求失败" }));
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
      const body: Record<string, string> = {
        name: editName,
        baseUrl: editBaseUrl,
        model: editModel,
      };
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

  if (!open) return null;

  return createPortal(
    <div className="settings-overlay" onClick={onClose} ref={overlayRef}>
      <div
        className="settings-modal"
        onClick={(e) => e.stopPropagation()}
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
      >
        <div className="settings-header">
          <h2 id="settings-modal-title">设置</h2>
          <button className="settings-close" onClick={onClose} type="button" aria-label="关闭设置"><AppIcon name="x" /></button>
        </div>

        <div className="settings-tabs">
          <button className={`settings-tab ${tab === "providers" ? "active" : ""}`} onClick={() => setTab("providers")} type="button">Agent 配置</button>
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
                        {agentStatus.activeRuntime === "claude-code" ? "Claude Code" : "Legacy（内置 Kernel）"}
                      </span>
                    </div>
                    <span className={`settings-status ${agentStatus.activeRuntime === "claude-code" ? "on" : "off"}`}>
                      {agentStatus.activeRuntime === "claude-code" ? "Claude Code" : "Legacy"}
                    </span>
                  </div>
                  <div className="settings-card">
                    <div>
                      <strong>回退运行时</strong>
                      <span className="settings-meta">
                        {agentStatus.fallbackRuntime === "legacy" ? "Legacy（内置 Kernel）" : agentStatus.fallbackRuntime}
                      </span>
                    </div>
                    <span className="settings-meta">仅在手动切换时使用</span>
                  </div>
                  <div className="settings-card">
                    <div>
                      <strong>Claude Code 状态</strong>
                      <span className="settings-meta">
                        {agentStatus.claudeCode.connected ? "运行时已加载" : "运行时不可用"}
                        {agentStatus.claudeCode.version ? ` · v${agentStatus.claudeCode.version}` : ""}
                        {agentStatus.claudeCode.model ? ` · ${agentStatus.claudeCode.model}` : ""}
                      </span>
                    </div>
                    <span className={`settings-status ${agentStatus.claudeCode.connected ? "on" : "off"}`}>
                      {agentStatus.claudeCode.connected ? "在线" : "离线"}
                    </span>
                  </div>
                  <div className="settings-card">
                    <div>
                      <strong>执行引擎</strong>
                      <span className="settings-meta">
                        {agentStatus.claudeCode.executable === "custom"
                          ? "自定义 free-code 可执行文件"
                          : "Claude Agent SDK 内置 Claude Code"}
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
          <div className="settings-body settings-providers-body">
            <div className="settings-provider-intro">
              <div className="settings-provider-intro-icon"><AppIcon name="settings" /></div>
              <div>
                <strong>模型与运行方案</strong>
                <span>先维护独立模型，再将 Think、Executor 与 Embedding 组合成可随时切换的 Agent 运行方案。</span>
              </div>
              <div className="settings-provider-summary">
                <span>{agentConfigs.length} 套方案</span>
                <span>{providers.filter((provider) => provider.type === "chat").length} 个对话模型</span>
                <span>{providers.filter((provider) => provider.type === "embedding").length} 个向量模型</span>
              </div>
            </div>
            <div className="settings-form settings-model-create-form">
              <div className="settings-config-heading">
                <div className="settings-section-title">
                  <span className="settings-section-index">02</span>
                  <div>
                  <strong>添加独立模型</strong>
                  <span>每条记录只保存一个模型。对话模型用于 Think / Executor，向量模型只用于 Embedding。</span>
                  </div>
                </div>
              </div>
              <div className="settings-provider-form-grid">
                <label className="settings-field">
                  <span>模型类型</span>
                  <select className="page-select" value={pType} onChange={(event) => setPType(event.target.value as ModelProvider["type"])}>
                    <option value="chat">对话模型</option>
                    <option value="embedding">向量模型</option>
                  </select>
                </label>
                <label className="settings-field">
                  <span>显示名称</span>
                  <input className="page-input" value={pName} onChange={(e) => setPName(e.target.value)} placeholder={pType === "chat" ? "如：DeepSeek 执行模型" : "如：Qwen3 向量模型"} />
                </label>
                <label className="settings-field settings-field-wide">
                  <span>API 地址</span>
                  <input className="page-input" value={pBaseUrl} onChange={(e) => setPBaseUrl(e.target.value)} placeholder="https://api.deepseek.com" />
                </label>
                <label className="settings-field settings-field-wide">
                  <span>模型名称</span>
                  <div className="settings-model-row">
                    <input
                      className="page-input"
                      value={pModel}
                      onChange={(e) => { setPModel(e.target.value); setAddShowDropdown(false); }}
                      onFocus={() => { if (addModels.length > 0) setAddShowDropdown(true); }}
                      placeholder={pType === "chat" ? "如：deepseek-chat" : "如：Qwen/Qwen3-Embedding-8B"}
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
                </label>
                <label className="settings-field settings-field-wide">
                  <span>API Key</span>
                  <input className="page-input" value={pApiKey} onChange={(e) => setPApiKey(e.target.value)} placeholder="sk-xxxx" type="password" autoComplete="new-password" />
                </label>
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
              <div className="settings-form-footer">
                <span>保存后可先测试连接，再加入运行方案。</span>
                <button className="page-primary-button" onClick={addProvider} disabled={loading} type="button">
                  <AppIcon name="plus" /> {loading ? "保存中..." : `添加${pType === "chat" ? "对话" : "向量"}模型`}
                </button>
              </div>
            </div>

            <section className="settings-config-section">
              <div className="settings-config-heading">
                <div className="settings-section-title">
                  <span className="settings-section-index">01</span>
                  <div>
                  <strong>Agent 运行配置</strong>
                  <span>一套配置同时指定 Think、Executor 和 Embedding；新对话与已有对话都会使用当前启用项。</span>
                  </div>
                </div>
              </div>
              <div className="settings-config-builder">
                <label className="settings-config-name-field">
                  <span>方案名称</span>
                  <input className="page-input" value={configName} onChange={(event) => setConfigName(event.target.value)} placeholder="如：高质量分析" />
                </label>
                <label>
                  <span>Think · 思考模型</span>
                  <select className="page-select" value={thinkingProviderId} onChange={(event) => setThinkingProviderId(event.target.value)}>
                    {providers.filter((provider) => provider.type === "chat" && provider.enabled && provider.configured).map((provider) => (
                      <option key={provider.id} value={provider.id}>{provider.name} · {provider.model}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Executor · 执行模型</span>
                  <select className="page-select" value={executorProviderId} onChange={(event) => setExecutorProviderId(event.target.value)}>
                    {providers.filter((provider) => provider.type === "chat" && provider.enabled && provider.configured).map((provider) => (
                      <option key={provider.id} value={provider.id}>{provider.name} · {provider.model}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Embedding · 向量模型</span>
                  <select className="page-select" value={embeddingProviderId} onChange={(event) => setEmbeddingProviderId(event.target.value)}>
                    {providers.filter((provider) => provider.type === "embedding" && provider.enabled && provider.configured).map((provider) => (
                      <option key={provider.id} value={provider.id}>{provider.name} · {provider.model}</option>
                    ))}
                  </select>
                </label>
                <button className="page-primary-button" onClick={createAgentConfig} disabled={configSaving} type="button">
                  <AppIcon name="plus" /> {configSaving ? "处理中..." : "保存方案"}
                </button>
              </div>
              <div className="settings-config-list">
                {agentConfigs.map((config) => (
                  <article className={`settings-config-card ${config.active ? "active" : ""}`} key={config.id}>
                    <div className="settings-config-card-title">
                      <div>
                        <span className="settings-config-kicker">运行方案</span>
                        <strong>{config.name}</strong>
                      </div>
                      <span className="settings-config-state">{config.active ? "当前使用" : "未启用"}</span>
                    </div>
                    <dl>
                      <div><dt><AppIcon name="spark" /> Think</dt><dd>{providerLabel(config.thinkingProviderId)}</dd></div>
                      <div><dt><AppIcon name="automation" /> Executor</dt><dd>{providerLabel(config.executorProviderId)}</dd></div>
                      <div><dt><AppIcon name="search" /> Embedding</dt><dd>{providerLabel(config.embeddingProviderId)}</dd></div>
                    </dl>
                    <div className="settings-card-actions">
                      <button className={config.active ? "page-primary-button" : "page-secondary-button"} onClick={() => activateAgentConfig(config.id)} disabled={configSaving || config.active} type="button">
                        {config.active ? "使用中" : "使用此配置"}
                      </button>
                      <button className="page-secondary-button" onClick={() => removeAgentConfig(config.id)} disabled={configSaving} type="button">删除</button>
                    </div>
                  </article>
                ))}
                {agentConfigs.length === 0 && <div className="settings-config-empty">还没有运行配置。创建第一套后会自动启用。</div>}
              </div>
            </section>

            <div className="settings-library-heading">
              <div>
                <strong>已添加模型</strong>
                <span>测试连接、编辑参数或移除不再使用的模型。</span>
              </div>
              <span className="settings-library-count">{providers.length}</span>
            </div>

            {providers.length === 0 && (
              <div className="search-empty">暂无独立模型，请添加</div>
            )}

            <div className="settings-list">
              {providers.map((p) => (
                <div className={`settings-card ${editingId === p.id ? "settings-card-editing" : ""}`} key={p.id}>
                  {editingId === p.id ? (
                    <div className="settings-edit-form">
                      <span className={`settings-model-type ${p.type}`}>{p.type === "chat" ? "对话模型" : "向量模型"}</span>
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
                        <span className={`settings-model-type ${p.type}`}>{p.type === "chat" ? "对话模型" : "向量模型"}</span>
                        <strong>{p.name}</strong>
                        <span className="settings-meta">{p.model} @ {p.baseUrl}</span>
                        <span className={`settings-status ${p.configured ? "on" : "off"}`}>
                          {p.configured ? "已配置" : "未配置 Key"}
                        </span>
                      </div>
                      <div className="settings-card-actions">
                        {p.type === "chat" ? (
                          <button className="page-secondary-button" onClick={() => testProvider(p.id)} disabled={testingId === p.id}>
                            {testingId === p.id ? "测试中..." : "测试对话"}
                          </button>
                        ) : (
                          <button className="page-secondary-button" onClick={() => testEmbeddingProvider(p.id)} disabled={testingId === `${p.id}:embedding`}>
                            {testingId === `${p.id}:embedding` ? "测试中..." : "测试向量"}
                          </button>
                        )}
                        <button className="page-secondary-button" onClick={() => startEdit(p)}>编辑</button>
                        <button className="page-secondary-button" onClick={() => setProviderToDelete(p)}>删除</button>
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
      <ConfirmDialog
        open={Boolean(providerToDelete)}
        title="删除模型账号"
        message={`确定删除模型账号「${providerToDelete?.name ?? ""}」吗？依赖它的角色和工作流可能无法运行。`}
        loading={deletingProvider}
        onConfirm={deleteProvider}
        onCancel={() => setProviderToDelete(null)}
      />
    </div>,
    document.body,
  );
}
