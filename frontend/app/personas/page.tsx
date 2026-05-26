"use client";

import { useEffect, useState } from "react";
import type { AgentPersona, ModelProvider } from "shared";
import { fetchJson } from "../lib/api";
import { useToast } from "../lib/toast-context";
import { Sidebar } from "../components/Sidebar";
import { ThemeToggle } from "../components/ThemeToggle";

export default function PersonasPage() {
  const { showToast } = useToast();
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [personas, setPersonas] = useState<AgentPersona[]>([]);

  // Add form
  const [pRole, setPRole] = useState("");
  const [pDesc, setPDesc] = useState("");
  const [pPrompt, setPPrompt] = useState("");
  const [pProviderId, setPProviderId] = useState("");
  const [pThinkingProviderId, setPThinkingProviderId] = useState("");
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // Edit state
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null);
  const [epName, setEpName] = useState("");
  const [epRole, setEpRole] = useState("");
  const [epDesc, setEpDesc] = useState("");
  const [epPrompt, setEpPrompt] = useState("");
  const [epProviderId, setEpProviderId] = useState("");
  const [epThinkingProviderId, setEpThinkingProviderId] = useState("");

  async function refresh() {
    const [p, per] = await Promise.all([
      fetchJson<{ providers: ModelProvider[] }>("/settings/providers"),
      fetchJson<{ personas: AgentPersona[] }>("/settings/personas"),
    ]);
    setProviders(p.providers);
    setPersonas(per.personas);
  }

  useEffect(() => { refresh(); }, []);

  async function addPersona() {
    if (!pRole.trim() || !pDesc.trim() || !pPrompt.trim() || !pProviderId) return;
    try {
      const body: Record<string, string> = {
        name: pRole, role: pRole, description: pDesc, systemPrompt: pPrompt, providerId: pProviderId,
      };
      if (pThinkingProviderId) body.thinkingProviderId = pThinkingProviderId;
      await fetchJson("/settings/personas", { method: "POST", body: JSON.stringify(body) });
      setPRole(""); setPDesc(""); setPPrompt(""); setPProviderId(""); setPThinkingProviderId("");
      setShowAddForm(false);
      await refresh();
      showToast("角色已添加", "success");
    } catch { showToast("添加失败", "error"); }
  }

  async function deletePersona(id: string) {
    await fetchJson(`/settings/personas/${id}`, { method: "DELETE" });
    await refresh();
    showToast("已删除", "success");
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

  function cancelEditPersona() { setEditingPersonaId(null); }

  async function saveEditPersona() {
    if (!epName.trim() || !epRole.trim() || !epPrompt.trim() || !epProviderId) return;
    try {
      const body: Record<string, string> = {
        name: epName, role: epRole, description: epDesc, systemPrompt: epPrompt, providerId: epProviderId,
      };
      if (epThinkingProviderId) body.thinkingProviderId = epThinkingProviderId;
      await fetchJson(`/settings/personas/${editingPersonaId}`, {
        method: "PATCH", body: JSON.stringify(body),
      });
      setEditingPersonaId(null);
      await refresh();
      showToast("保存成功", "success");
    } catch { showToast("保存失败", "error"); }
  }

  async function generatePrompt() {
    if (!pDesc.trim()) return;
    setGeneratingPrompt(true);
    try {
      const res = await fetchJson<{ prompt: string }>("/settings/generate-prompt", {
        method: "POST", body: JSON.stringify({ description: pDesc }),
      });
      setPPrompt(res.prompt);
    } catch { setPPrompt("生成失败，请手动填写。"); }
    setGeneratingPrompt(false);
  }

  return (
    <>
      <Sidebar />
      <main className="main">
        <ThemeToggle />
        <div className="main-inner" style={{ maxWidth: 700, paddingTop: 40 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <h1 style={{ fontSize: 20, color: "var(--c-f0f0f0)", margin: 0 }}>角色人格</h1>
            <button className="page-primary-button" onClick={() => setShowAddForm(!showAddForm)} type="button">
              {showAddForm ? "取消" : "+ 添加角色"}
            </button>
          </div>

          {showAddForm && (
            <div className="settings-card" style={{ marginBottom: 16, borderColor: "var(--c-4a90e6)" }}>
              <div className="settings-edit-form">
                <select className="page-input" value={pProviderId} onChange={(e) => setPProviderId(e.target.value)}>
                  <option value="">选择回复模型...</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.model})</option>
                  ))}
                </select>
                <select className="page-input" value={pThinkingProviderId} onChange={(e) => setPThinkingProviderId(e.target.value)}>
                  <option value="">思考模型（可选）</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.model})</option>
                  ))}
                </select>
                <input className="page-input" value={pRole} onChange={(e) => setPRole(e.target.value)} placeholder="角色名称，如：销售运营专家" />
                <input className="page-input" value={pDesc} onChange={(e) => setPDesc(e.target.value)} placeholder="角色说明，如：专注线索分配和转化漏斗分析" />
                <textarea className="page-textarea" value={pPrompt} onChange={(e) => setPPrompt(e.target.value)} placeholder="System Prompt，或让 AI 帮你写" rows={3} />
                <button className="page-secondary-button" onClick={generatePrompt} disabled={generatingPrompt || !pDesc.trim()} type="button" style={{ alignSelf: "flex-start", fontSize: 12 }}>
                  {generatingPrompt ? "生成中..." : "AI 生成 Prompt"}
                </button>
                <button className="page-primary-button" onClick={addPersona} type="button">确认添加</button>
              </div>
            </div>
          )}

          {personas.length === 0 && (
            <div className="search-empty">暂无角色人格</div>
          )}

          <div className="settings-list">
            {personas.map((p) => (
              <div className={`settings-card ${editingPersonaId === p.id ? "settings-card-editing" : ""}`} key={p.id}>
                {editingPersonaId === p.id ? (
                  <div className="settings-edit-form">
                    <input className="page-input" value={epName} onChange={(e) => setEpName(e.target.value)} placeholder="角色名称" />
                    <input className="page-input" value={epRole} onChange={(e) => setEpRole(e.target.value)} placeholder="角色说明" />
                    <input className="page-input" value={epDesc} onChange={(e) => setEpDesc(e.target.value)} placeholder="角色描述" />
                    <textarea className="page-textarea" value={epPrompt} onChange={(e) => setEpPrompt(e.target.value)} placeholder="System Prompt" rows={3} />
                    <select className="page-input" value={epProviderId} onChange={(e) => setEpProviderId(e.target.value)}>
                      <option value="">选择回复模型...</option>
                      {providers.map((prov) => (
                        <option key={prov.id} value={prov.id}>{prov.name} ({prov.model})</option>
                      ))}
                    </select>
                    <select className="page-input" value={epThinkingProviderId} onChange={(e) => setEpThinkingProviderId(e.target.value)}>
                      <option value="">思考模型（可选）</option>
                      {providers.map((prov) => (
                        <option key={prov.id} value={prov.id}>{prov.name} ({prov.model})</option>
                      ))}
                    </select>
                    <div className="settings-card-actions">
                      <button className="page-primary-button" onClick={saveEditPersona} type="button">保存</button>
                      <button className="page-secondary-button" onClick={cancelEditPersona} type="button">取消</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <strong>{p.name}</strong>
                      <span className="settings-meta">{p.role} · 回复: {providers.find(x => x.id === p.providerId)?.name ?? "未知"}{p.thinkingProviderId ? ` · 思考: ${providers.find(x => x.id === p.thinkingProviderId)?.name ?? "未知"}` : ""}</span>
                      <span className={`settings-status ${p.enabled ? "on" : "off"}`}>
                        {p.enabled ? "已启用" : "已停用"}
                      </span>
                    </div>
                    <p className="settings-prompt-preview">{p.systemPrompt.slice(0, 120)}{p.systemPrompt.length > 120 ? "..." : ""}</p>
                    {p.memory && (
                      <p className="settings-prompt-preview" style={{ fontSize: 11, color: "var(--c-9b9b9b)" }}>
                        🧠 {p.memory.slice(-200)}
                      </p>
                    )}
                    <div className="settings-card-actions">
                      <button className="page-secondary-button" onClick={() => startEditPersona(p)}>编辑</button>
                      <button className="page-secondary-button" onClick={() => deletePersona(p.id)}>删除</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
