"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AgentSkill, Automation, LibraryItem, Plugin, PluginConfigResponse, Project, ToolDefinition } from "shared";
import { fetchJson } from "../lib/api";
import { useWorkspace } from "../lib/workspace-context";

export function SearchPage() {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("全部");
  const [enterpriseFilter, setEnterpriseFilter] = useState("全部");

  const types = ["项目", "对话", "资料", "自动化"] as const;

  const results = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const items = [
      ...workspace.projects.map((item) => {
        const ent = workspace.enterprises.find((e) => e.id === item.enterpriseId);
        return {
          id: item.id,
          type: "项目" as const,
          title: item.name,
          enterpriseId: item.enterpriseId,
          enterpriseName: ent?.name ?? "",
          subtitle: item.description ?? "",
          href: `/projects/${item.id}`,
        };
      }),
      ...workspace.conversations.map((item) => {
        const ent = workspace.enterprises.find((e) => e.id === item.enterpriseId);
        return {
          id: item.id,
          type: "对话" as const,
          title: item.title,
          enterpriseId: item.enterpriseId,
          enterpriseName: ent?.name ?? "",
          subtitle: "",
          href: `/chat/${item.id}`,
        };
      }),
      ...workspace.libraryItems.map((item) => {
        const proj = workspace.projects.find((p) => p.id === item.projectId);
        const ent = proj ? workspace.enterprises.find((e) => e.id === proj.enterpriseId) : undefined;
        return {
          id: item.id,
          type: "资料" as const,
          title: item.name,
          enterpriseId: proj?.enterpriseId ?? "",
          enterpriseName: ent?.name ?? "",
          subtitle: item.summary,
          href: `/library`,
        };
      }),
      ...workspace.automations.map((item) => {
        const proj = workspace.projects.find((p) => p.id === item.projectId);
        const ent = proj ? workspace.enterprises.find((e) => e.id === proj.enterpriseId) : undefined;
        return {
          id: item.id,
          type: "自动化" as const,
          title: item.name,
          enterpriseId: proj?.enterpriseId ?? "",
          enterpriseName: ent?.name ?? "",
          subtitle: `${item.trigger} → ${item.action}`,
          href: `/automation`,
        };
      }),
    ];

    let filtered = items;
    if (keyword) {
      filtered = filtered.filter(
        (item) =>
          item.title.toLowerCase().includes(keyword) ||
          item.subtitle.toLowerCase().includes(keyword),
      );
    }
    if (typeFilter !== "全部") {
      filtered = filtered.filter((item) => item.type === typeFilter);
    }
    if (enterpriseFilter !== "全部") {
      filtered = filtered.filter((item) => item.enterpriseId === enterpriseFilter);
    }
    return filtered;
  }, [query, typeFilter, enterpriseFilter, workspace]);

  const typeCounts = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const all = [
      ...workspace.projects.map((item) => ({ type: "项目" as const, title: item.name })),
      ...workspace.conversations.map((item) => ({ type: "对话" as const, title: item.title })),
      ...workspace.libraryItems.map((item) => ({ type: "资料" as const, title: item.name })),
      ...workspace.automations.map((item) => ({ type: "自动化" as const, title: item.name })),
    ];
    const filtered = keyword
      ? all.filter((item) => item.title.toLowerCase().includes(keyword))
      : all;
    return {
      项目: filtered.filter((i) => i.type === "项目").length,
      对话: filtered.filter((i) => i.type === "对话").length,
      资料: filtered.filter((i) => i.type === "资料").length,
      自动化: filtered.filter((i) => i.type === "自动化").length,
    };
  }, [query, workspace]);

  return (
    <PageShell title="搜索" description="跨企业、项目、对话、资料和自动化查找。">
      <div className="lib-top-bar">
        <input
          className="page-input lib-search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索线索、订单、资料或规则"
        />
        <button
          className="page-primary-button"
          onClick={() => router.push("/library")}
          type="button"
        >
          + 添加资料
        </button>
      </div>

      <div className="search-filters">
        <div className="search-filter-chips">
          <select
            className="search-enterprise-select search-enterprise-filter-chip"
            value={enterpriseFilter}
            onChange={(e) => setEnterpriseFilter(e.target.value)}
          >
            <option value="全部">全部企业</option>
            {workspace.enterprises.map((ent) => (
              <option key={ent.id} value={ent.id}>
                {ent.name}
              </option>
            ))}
          </select>
          {types.map((t) => (
            <button
              key={t}
              className={`search-chip ${typeFilter === t ? "active" : ""}`}
              onClick={() => setTypeFilter(typeFilter === t ? "全部" : t)}
              type="button"
            >
              {t}
              <span className="search-chip-count">{typeCounts[t]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="page-list">
        {results.length === 0 && (
          <div className="search-empty">没有找到匹配的结果</div>
        )}
        {results.map((item) => (
          <div
            className="page-row search-result"
            key={`${item.type}-${item.id}`}
            onClick={() => router.push(item.href)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter") router.push(item.href);
            }}
          >
            <div className="search-result-header">
              <span className={`search-type-badge search-type-${item.type}`}>{item.type}</span>
              {item.enterpriseName && (
                <span className="search-enterprise-badge">{item.enterpriseName}</span>
              )}
            </div>
            <strong>{item.title}</strong>
            {item.subtitle && <p>{item.subtitle}</p>}
          </div>
        ))}
      </div>
    </PageShell>
  );
}

export function LibraryPage() {
  const { workspace, refresh } = useWorkspace();
  const [showForm, setShowForm] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [enterpriseFilter, setEnterpriseFilter] = useState("全部");
  const [visibilityFilter, setVisibilityFilter] = useState("全部");
  const [enterpriseId, setEnterpriseId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [type, setType] = useState<LibraryItem["type"]>("screenshot");
  const [visibility, setVisibility] = useState<LibraryItem["visibility"]>("public");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  function handleFile(f: File | null) {
    if (!f) return;
    setSelectedFile(f);
    if (!name.trim()) {
      const base = f.name.replace(/\.[^.]+$/, "");
      setName(base);
    }
    // Guess type from extension
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (ext && ["xlsx", "xls", "csv"].includes(ext)) setType("spreadsheet");
    else if (ext && ["doc", "docx", "pdf", "txt", "md"].includes(ext)) setType("document");
    else if (ext && ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) setType("screenshot");
  }

  useEffect(() => {
    if (!enterpriseId && workspace.enterprises[0]) {
      setEnterpriseId(workspace.enterprises[0].id);
    }
    if (!projectId && workspace.projects[0]) {
      setProjectId(workspace.projects[0].id);
    }
  }, [enterpriseId, projectId, workspace.enterprises, workspace.projects]);

  const filtered = useMemo(() => {
    let items = workspace.libraryItems;
    if (enterpriseFilter !== "全部") {
      items = items.filter((i) => i.enterpriseId === enterpriseFilter);
    }
    if (visibilityFilter !== "全部") {
      items = items.filter((i) => i.visibility === visibilityFilter);
    }
    if (searchQuery.trim()) {
      const kw = searchQuery.trim().toLowerCase();
      items = items.filter(
        (i) => i.name.toLowerCase().includes(kw) || i.summary.toLowerCase().includes(kw),
      );
    }
    return items;
  }, [workspace.libraryItems, enterpriseFilter, visibilityFilter, searchQuery]);

  const projectsForEnterprise = useMemo(
    () => workspace.projects.filter((p) => p.enterpriseId === enterpriseId),
    [workspace.projects, enterpriseId],
  );

  function resetLibraryForm() {
    setEditingItemId(null);
    setName("");
    setSummary("");
    setSelectedFile(null);
    setType("screenshot");
    setVisibility("public");
    setShowForm(false);
  }

  function startEditItem(item: LibraryItem) {
    setEditingItemId(item.id);
    setEnterpriseId(item.enterpriseId);
    setProjectId(item.projectId);
    setName(item.name);
    setSummary(item.summary);
    setType(item.type);
    setVisibility(item.visibility);
    setSelectedFile(null);
    setShowForm(true);
  }

  async function saveItem() {
    if (!name.trim() || !summary.trim()) return;
    try {
      const body = { enterpriseId, projectId, name, summary, type, visibility };
      if (editingItemId) {
        await fetchJson<LibraryItem>(`/library/${editingItemId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await fetchJson<LibraryItem>("/library", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      resetLibraryForm();
      await refresh();
    } catch (e) {
      console.error(editingItemId ? "编辑资料失败" : "添加资料失败", e);
    }
  }

  async function deleteItem(id: string) {
    try {
      await fetchJson(`/library/${id}`, { method: "DELETE" });
      await refresh();
    } catch (e) {
      console.error("删除资料失败", e);
    }
  }

  const typeLabel: Record<LibraryItem["type"], string> = {
    screenshot: "截图",
    spreadsheet: "表格",
    document: "文档",
    note: "备注",
  };

  return (
    <PageShell title="资料库" description="沉淀截图、表格、文档和业务备注，分企业、分可见范围管理。">
      {/* Search + Add */}
      <div className="lib-top-bar">
        <input
          className="page-input lib-search-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索资料名称或说明..."
        />
        <button
          className="page-primary-button"
          onClick={() => {
            if (showForm) {
              resetLibraryForm();
            } else {
              setShowForm(true);
            }
          }}
          type="button"
        >
          {showForm ? "取消" : "+ 添加资料"}
        </button>
      </div>

      {/* Library Form (collapsible) */}
      {showForm && (
        <div className="page-form-grid lib-upload-form">
          <div className="lib-file-upload">
            <input
              type="file"
              id="lib-file-input"
              accept="image/*,.xlsx,.xls,.csv,.pdf,.doc,.docx,.txt,.md"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              hidden
            />
            <label htmlFor="lib-file-input" className="lib-file-label">
              {selectedFile ? (
                <span className="lib-file-name">📎 {selectedFile.name}</span>
              ) : (
                <span>📁 选择文件上传</span>
              )}
            </label>
          </div>
          <select
            className="page-input"
            value={enterpriseId}
            onChange={(e) => {
              setEnterpriseId(e.target.value);
              const first = workspace.projects.filter((p) => p.enterpriseId === e.target.value)[0];
              setProjectId(first?.id ?? "");
            }}
          >
            {workspace.enterprises.map((ent) => (
              <option key={ent.id} value={ent.id}>{ent.name}</option>
            ))}
          </select>
          <select className="page-input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projectsForEnterprise.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
          <select className="page-input" value={type} onChange={(e) => setType(e.target.value as LibraryItem["type"])}>
            <option value="screenshot">截图</option>
            <option value="spreadsheet">表格</option>
            <option value="document">文档</option>
            <option value="note">备注</option>
          </select>
          <select className="page-input" value={visibility} onChange={(e) => setVisibility(e.target.value as LibraryItem["visibility"])}>
            <option value="public">公共</option>
            <option value="private">私有</option>
          </select>
          <input className="page-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="资料名称" />
          <input className="page-input" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="资料说明" />
          <button className="page-primary-button" onClick={saveItem} type="button">
            {editingItemId ? "保存修改" : "确认添加"}
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="search-filters">
        <div className="search-filter-chips">
          <button
            className={`search-chip ${enterpriseFilter === "全部" ? "active" : ""}`}
            onClick={() => setEnterpriseFilter("全部")}
            type="button"
          >
            全部企业
          </button>
          {workspace.enterprises.map((ent) => (
            <button
              key={ent.id}
              className={`search-chip ${enterpriseFilter === ent.id ? "active" : ""}`}
              onClick={() => setEnterpriseFilter(ent.id)}
              type="button"
            >
              {ent.name}
            </button>
          ))}
        </div>
        <select
          className="search-enterprise-select"
          value={visibilityFilter}
          onChange={(e) => setVisibilityFilter(e.target.value)}
        >
          <option value="全部">全部可见范围</option>
          <option value="public">公共</option>
          <option value="private">私有</option>
        </select>
      </div>

      {/* Cards */}
      <div className="page-card-grid">
        {filtered.length === 0 && (
          <div className="search-empty" style={{ gridColumn: "1 / -1" }}>暂无资料</div>
        )}
        {filtered.map((item) => {
          const ent = workspace.enterprises.find((e) => e.id === item.enterpriseId);
          return (
            <article className="page-card" key={item.id}>
              <div className="lib-card-header">
                <span className={`lib-visibility-badge lib-visibility-${item.visibility}`}>
                  {item.visibility === "public" ? "公共" : "私有"}
                </span>
                <span className="lib-type-badge">{typeLabel[item.type]}</span>
                <button
                  className="sidebar-mini-action"
                  onClick={() => startEditItem(item)}
                  type="button"
                  title="编辑资料"
                  style={{ display: "inline-flex" }}
                >
                  ✏
                </button>
                <button
                  className="lib-delete-btn"
                  onClick={() => deleteItem(item.id)}
                  type="button"
                  title="删除资料"
                >
                  ×
                </button>
              </div>
              <h3>{item.name}</h3>
              <p>{item.summary}</p>
              {ent && <span className="lib-enterprise-tag">{ent.name}</span>}
            </article>
          );
        })}
      </div>
    </PageShell>
  );
}

export function PluginsPage() {
  const { workspace, refresh } = useWorkspace();
  const [showSkillForm, setShowSkillForm] = useState(false);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [skillName, setSkillName] = useState("");
  const [skillDescription, setSkillDescription] = useState("");
  const [skillPrompt, setSkillPrompt] = useState("");
  const [skillToolIds, setSkillToolIds] = useState<string[]>([]);
  const [skillMessage, setSkillMessage] = useState("");
  const [configPlugin, setConfigPlugin] = useState<Plugin | null>(null);
  const [pluginConfig, setPluginConfig] = useState<PluginConfigResponse | null>(null);
  const [pluginWebhook, setPluginWebhook] = useState("");
  const [pluginMessage, setPluginMessage] = useState("");

  const selectedSkill = useMemo(
    () => workspace.skills.find((skill) => skill.id === editingSkillId),
    [editingSkillId, workspace.skills],
  );

  function toolStatusLabel(status: ToolDefinition["status"]) {
    if (status === "enabled") return "可用";
    if (status === "needs_config") return "待配置";
    return "停用";
  }

  function openNewSkillForm() {
    setEditingSkillId(null);
    setSkillName("");
    setSkillDescription("");
    setSkillPrompt("");
    setSkillToolIds([]);
    setSkillMessage("");
    setShowSkillForm(true);
  }

  function startEditSkill(skill: AgentSkill) {
    setEditingSkillId(skill.id);
    setSkillName(skill.name);
    setSkillDescription(skill.description);
    setSkillPrompt(skill.prompt);
    setSkillToolIds([...skill.toolIds]);
    setSkillMessage("");
    setShowSkillForm(true);
  }

  function cancelSkillForm() {
    setShowSkillForm(false);
    setEditingSkillId(null);
    setSkillName("");
    setSkillDescription("");
    setSkillPrompt("");
    setSkillToolIds([]);
    setSkillMessage("");
  }

  async function togglePlugin(plugin: Plugin) {
    try {
      await fetchJson<Plugin>(`/plugins/${plugin.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !plugin.enabled }),
      });
      await refresh();
    } catch {
      setPluginMessage("请先配置插件，再启用。");
    }
  }

  async function openPluginConfig(plugin: Plugin) {
    setConfigPlugin(plugin);
    setPluginMessage("");
    const config = await fetchJson<PluginConfigResponse>(`/plugins/${plugin.id}/config`);
    setPluginConfig(config);
    setPluginWebhook(config.fields.webhookUrl && config.fields.webhookUrl !== "********" ? config.fields.webhookUrl : "");
  }

  async function savePluginConfig() {
    if (!configPlugin) return;
    setPluginMessage("");
    try {
      await fetchJson<PluginConfigResponse>(`/plugins/${configPlugin.id}/config`, {
        method: "PATCH",
        body: JSON.stringify({ fields: { webhookUrl: pluginWebhook } }),
      });
      setPluginMessage("配置已保存");
      await refresh();
      await openPluginConfig(configPlugin);
    } catch {
      setPluginMessage("配置保存失败");
    }
  }

  async function toggleTool(tool: ToolDefinition) {
    const nextStatus = tool.status === "enabled" ? "disabled" : "enabled";
    try {
      await fetchJson<ToolDefinition>(`/tools/${tool.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      await refresh();
    } catch {
      // silent — non-critical
    }
  }

  async function saveSkill() {
    if (!skillName.trim() || !skillDescription.trim() || !skillPrompt.trim()) {
      setSkillMessage("请补全能力名称、使用场景和执行指令。");
      return;
    }
    try {
      const body = {
        name: skillName.trim(),
        description: skillDescription.trim(),
        prompt: skillPrompt.trim(),
        toolIds: skillToolIds,
      };
      if (editingSkillId) {
        await fetchJson(`/skills/${editingSkillId}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await fetchJson<AgentSkill>("/skills", { method: "POST", body: JSON.stringify(body) });
      }
      setSkillMessage("能力包已保存");
      cancelSkillForm();
      await refresh();
    } catch {
      setSkillMessage("保存失败，请检查内容后重试。");
    }
  }

  async function toggleSkill(skill: AgentSkill) {
    try {
      await fetchJson<AgentSkill>(`/skills/${skill.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !skill.enabled }),
      });
      await refresh();
    } catch {
      // silent — non-critical
    }
  }

  function toggleSkillTool(toolId: string) {
    setSkillToolIds((prev) => prev.includes(toolId) ? prev.filter((item) => item !== toolId) : [...prev, toolId]);
  }

  async function removeSkill(id: string) {
    try {
      await fetchJson(`/skills/${id}`, { method: "DELETE" });
      if (editingSkillId === id) cancelSkillForm();
      await refresh();
    } catch {
      setSkillMessage("删除失败，请稍后重试。");
    }
  }

  return (
    <PageShell title="插件" description="管理工具、Skills 和外部连接。">
      {/* Tools */}
      <div className="page-section-title">可用工具</div>
      <div className="tool-grid">
        {workspace.tools.map((tool) => (
          <article className="page-card" key={tool.id}>
            <span className={tool.status === "enabled" ? "skill-on" : "skill-off"}>
              {tool.status === "enabled" ? "已启用" : tool.status === "needs_config" ? "待配置" : "已停用"}
            </span>
            <h3>{tool.name}</h3>
            <p>{tool.description}</p>
            <button className="page-secondary-button" onClick={() => toggleTool(tool)} type="button">
              {tool.status === "enabled" ? "停用" : "启用"}
            </button>
          </article>
        ))}
      </div>

      {/* Skills */}
      <div className="page-section-title">Skills 能力包</div>
      <div className="skill-toolbar">
        <p>能力包是一套可复用的 Agent 操作方法：明确适用场景、允许调用的工具，以及回复时必须遵守的执行指令。</p>
      </div>

      <div className="skill-workbench">
        <section className="skill-library-panel">
          <div className="skill-panel-header">
            <span>已配置能力</span>
            <strong>{workspace.skills.filter((skill) => skill.enabled).length}/{workspace.skills.length} 启用</strong>
          </div>
          <div className="skill-list">
            {workspace.skills.map((skill) => {
              const skillTools = skill.toolIds
                .map((toolId) => workspace.tools.find((tool) => tool.id === toolId))
                .filter(Boolean) as ToolDefinition[];
              return (
                <article className={`skill-card ${editingSkillId === skill.id ? "active" : ""}`} key={skill.id}>
                  <div className="skill-card-top">
                    <span className={skill.enabled ? "skill-on" : "skill-off"}>{skill.enabled ? "启用中" : "已停用"}</span>
                    <div className="skill-card-actions">
                      <button className="sidebar-mini-action" onClick={() => startEditSkill(skill)} title="编辑能力包" type="button" style={{ display: "inline-flex" }}>✏</button>
                      <button className="sidebar-mini-action danger" onClick={() => removeSkill(skill.id)} title="删除能力包" type="button" style={{ display: "inline-flex" }}>×</button>
                    </div>
                  </div>
                  <h3>{skill.name}</h3>
                  <p>{skill.description}</p>
                  <div className="skill-tools">
                    {skillTools.length === 0 && <span>无工具，仅提示词</span>}
                    {skillTools.map((tool) => (
                      <span key={tool.id} className={tool.status === "enabled" ? "tool-ready" : "tool-needs-config"}>
                        {tool.name} · {toolStatusLabel(tool.status)}
                      </span>
                    ))}
                  </div>
                  <div className="skill-prompt-preview">{skill.prompt}</div>
                  <button className="page-secondary-button" onClick={() => toggleSkill(skill)} type="button">
                    {skill.enabled ? "停用能力" : "启用能力"}
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <section className="skill-builder-panel">
          <div className="skill-panel-header">
            <span>{editingSkillId ? "编辑能力包" : "新建能力包"}</span>
            {selectedSkill && <strong>{selectedSkill.enabled ? "当前启用" : "当前停用"}</strong>}
          </div>
          {!showSkillForm ? (
            <div className="skill-empty-editor">
              <strong>选择一个能力包开始编辑</strong>
              <p>也可以新建一个能力，把工具权限和 Agent 执行方法打包给角色使用。</p>
              <button className="page-primary-button" onClick={openNewSkillForm} type="button">新建能力包</button>
            </div>
          ) : (
            <div className="skill-form">
              <label className="skill-field">
                <span>能力名称</span>
                <input className="page-input" value={skillName} onChange={(e) => setSkillName(e.target.value)} placeholder="如：线索表诊断" />
              </label>
              <label className="skill-field">
                <span>适用场景</span>
                <input className="page-input" value={skillDescription} onChange={(e) => setSkillDescription(e.target.value)} placeholder="这个能力什么时候该被使用" />
              </label>
              <label className="skill-field skill-field-wide">
                <span>Agent 执行指令</span>
                <textarea
                  className="page-textarea"
                  rows={5}
                  value={skillPrompt}
                  onChange={(e) => setSkillPrompt(e.target.value)}
                  placeholder="写清楚分析步骤、输出格式、必须检查的字段、遇到风险时如何升级..."
                />
              </label>
              <div className="skill-field skill-field-wide">
                <span>允许调用的工具</span>
                <div className="skill-tool-picker">
                  {workspace.tools.map((tool) => (
                    <label className={`skill-tool-chip ${skillToolIds.includes(tool.id) ? "active" : ""} ${tool.status !== "enabled" ? "muted" : ""}`} key={tool.id}>
                      <input type="checkbox" checked={skillToolIds.includes(tool.id)} onChange={() => toggleSkillTool(tool.id)} />
                      <strong>{tool.name}</strong>
                      <small>{toolStatusLabel(tool.status)}</small>
                    </label>
                  ))}
                </div>
              </div>
              {skillMessage && <div className="settings-test-result skill-message">{skillMessage}</div>}
              <div className="skill-form-actions">
                <button className="page-primary-button" onClick={saveSkill} type="button">
                  {editingSkillId ? "保存修改" : "创建能力包"}
                </button>
                <button className="page-secondary-button" onClick={cancelSkillForm} type="button">取消</button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Connection Plugins */}
      <div className="page-section-title">连接插件</div>
      {pluginMessage && !configPlugin && <div className="settings-test-result">{pluginMessage}</div>}
      <div className="page-card-grid">
        {workspace.plugins.map((plugin) => (
          <article className="page-card" key={plugin.id}>
            <span className={plugin.enabled ? "skill-on" : "skill-off"}>
              {plugin.enabled ? "已启用" : plugin.configRequired && !plugin.configured ? "待绑定" : "未启用"}
            </span>
            <h3>{plugin.name}</h3>
            <p>{plugin.description}</p>
            {plugin.configRequired && (
              <p className="plugin-config-meta">
                {plugin.configured ? plugin.configSummary ?? "已绑定" : "需要绑定 Webhook / 应用凭据后才能使用"}
              </p>
            )}
            <div className="settings-card-actions">
              {plugin.configRequired && (
                <button className="page-secondary-button" onClick={() => openPluginConfig(plugin)} type="button">
                  配置
                </button>
              )}
              <button className="page-secondary-button" onClick={() => togglePlugin(plugin)} type="button">
                {plugin.enabled ? "停用" : "启用"}
              </button>
            </div>
          </article>
        ))}
      </div>

      {configPlugin && pluginConfig && (
        <div className="settings-overlay" onClick={() => setConfigPlugin(null)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-header">
              <h2>配置 {configPlugin.name}</h2>
              <button className="settings-close" onClick={() => setConfigPlugin(null)} type="button">×</button>
            </div>
            <div className="settings-body">
              <p className="plugin-config-meta">{pluginConfig.hint}</p>
              <label className="wf-props-label">Webhook URL</label>
              <input
                className="page-input"
                value={pluginWebhook}
                onChange={(e) => setPluginWebhook(e.target.value)}
                placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
              />
              <div className="settings-card-actions">
                <button className="page-primary-button" onClick={savePluginConfig} type="button">保存配置</button>
                <button className="page-secondary-button" onClick={() => setConfigPlugin(null)} type="button">关闭</button>
              </div>
              {pluginMessage && <div className="settings-test-result">{pluginMessage}</div>}
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

export function AutomationPage() {
  const router = useRouter();
  const { workspace, refresh } = useWorkspace();
  const [searchQuery, setSearchQuery] = useState("");
  const [enterpriseFilter, setEnterpriseFilter] = useState("全部");
  const [statusFilter, setStatusFilter] = useState("全部");

  const filtered = useMemo(() => {
    let items = workspace.automations;
    if (enterpriseFilter !== "全部") {
      const projectIds = workspace.projects
        .filter((p) => p.enterpriseId === enterpriseFilter)
        .map((p) => p.id);
      items = items.filter((a) => projectIds.includes(a.projectId));
    }
    if (statusFilter === "running") items = items.filter((a) => a.enabled);
    if (statusFilter === "paused") items = items.filter((a) => !a.enabled);
    if (searchQuery.trim()) {
      const kw = searchQuery.trim().toLowerCase();
      items = items.filter(
        (a) =>
          a.name.toLowerCase().includes(kw) ||
          a.trigger.toLowerCase().includes(kw) ||
          a.action.toLowerCase().includes(kw),
      );
    }
    return items;
  }, [workspace.automations, workspace.projects, enterpriseFilter, statusFilter, searchQuery]);

  async function toggle(automation: Automation) {
    try {
      await fetchJson<Automation>(`/automations/${automation.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !automation.enabled }),
      });
      await refresh();
    } catch (e) {
      console.error("切换自动化状态失败", e);
    }
  }

  async function removeAutomation(id: string) {
    try {
      await fetchJson(`/automations/${id}`, { method: "DELETE" });
      await refresh();
    } catch (e) {
      console.error("删除自动化失败", e);
    }
  }

  const triggerLabel: Record<Automation["triggerType"], string> = {
    schedule: "定时",
    message: "消息",
    webhook: "Webhook",
    email: "邮件",
    file: "文件",
    manual: "手动",
  };

  const actionLabel: Record<Automation["actionType"], string> = {
    send_email: "发邮件",
    call_ai: "AI 分析",
    shell: "Shell",
    api_call: "API 调用",
    notify: "通知",
    browser: "浏览器",
  };

  function modelLabel(id: string) {
    const provider = workspace.providers.find((item) => item.id === id);
    return provider ? `${provider.name} / ${provider.model}` : id;
  }

  function formatLastRun(iso?: string) {
    if (!iso) return "从未";
    const d = new Date(iso);
    const now = new Date();
    const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diffMin < 1) return "刚刚";
    if (diffMin < 60) return `${diffMin} 分钟前`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} 小时前`;
    const diffDay = Math.floor(diffHour / 24);
    return `${diffDay} 天前`;
  }

  return (
    <PageShell title="自动化" description="AI 驱动的自动化工作流：触发器 + Agent + 动作。">
      {/* Search + Add */}
      <div className="lib-top-bar">
        <input
          className="page-input lib-search-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索工作流名称、触发条件或动作..."
        />
        <button
          className="page-primary-button"
          onClick={() => router.push("/automation/workflow")}
          type="button"
        >
          + 新建工作流
        </button>
      </div>

      {/* Filters */}
      <div className="search-filters">
        <div className="search-filter-chips">
          <button className={`search-chip ${enterpriseFilter === "全部" ? "active" : ""}`} onClick={() => setEnterpriseFilter("全部")} type="button">全部企业</button>
          {workspace.enterprises.map((ent) => (
            <button key={ent.id} className={`search-chip ${enterpriseFilter === ent.id ? "active" : ""}`} onClick={() => setEnterpriseFilter(ent.id)} type="button">{ent.name}</button>
          ))}
        </div>
        <select className="search-enterprise-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="全部">全部状态</option>
          <option value="running">运行中</option>
          <option value="paused">已暂停</option>
        </select>
      </div>

      {/* Workflow Cards */}
      <div className="page-list">
        {filtered.length === 0 && <div className="search-empty">暂无匹配的工作流</div>}
        {filtered.map((automation) => {
          const proj = workspace.projects.find((p) => p.id === automation.projectId);
          const ent = proj ? workspace.enterprises.find((e) => e.id === proj.enterpriseId) : undefined;
          return (
            <div className="workflow-card" key={automation.id}>
              <div className="workflow-card-top">
                <div className="workflow-card-header">
                  <span className={`auto-status ${automation.enabled ? "auto-on" : "auto-off"}`}>
                    {automation.enabled ? "运行中" : "已暂停"}
                  </span>
                  <strong className="workflow-name">{automation.name}</strong>
                  {ent && <span className="lib-enterprise-tag auto-ent-tag">{ent.name}</span>}
                </div>
                <div className="workflow-card-actions">
                  <button
                    className="page-secondary-button"
                    onClick={() => router.push(`/automation/workflow/${automation.id}`)}
                    type="button"
                  >
                    编辑
                  </button>
                  <button className="page-secondary-button" onClick={() => toggle(automation)} type="button">
                    {automation.enabled ? "暂停" : "启用"}
                  </button>
                  <button className="page-secondary-button" onClick={() => removeAutomation(automation.id)} type="button">
                    删除
                  </button>
                </div>
              </div>

              <div className="workflow-flow">
                <div className="workflow-node workflow-trigger">
                  <span className="workflow-node-icon">⚡</span>
                  <span className="workflow-node-label">{triggerLabel[automation.triggerType]}</span>
                  <span className="workflow-node-text">{automation.trigger}</span>
                </div>
                <span className="workflow-arrow">→</span>
                {automation.agentModel && (
                  <>
                    <div className="workflow-node workflow-agent">
                      <span className="workflow-node-icon">🤖</span>
                      <span className="workflow-node-label">{modelLabel(automation.agentModel)}</span>
                    </div>
                    <span className="workflow-arrow">→</span>
                  </>
                )}
                <div className="workflow-node workflow-action">
                  <span className="workflow-node-icon">⚙</span>
                  <span className="workflow-node-label">{actionLabel[automation.actionType]}</span>
                  <span className="workflow-node-text">{automation.action}</span>
                  {automation.actionPluginId && (
                    <span className="workflow-node-text">
                      {workspace.plugins.find((plugin) => plugin.id === automation.actionPluginId)?.name ?? automation.actionPluginId}
                    </span>
                  )}
                </div>
              </div>

              {automation.systemPrompt && (
                <div className="workflow-prompt">
                  <span className="workflow-prompt-label">System Prompt</span>
                  <span className="workflow-prompt-text">{automation.systemPrompt}</span>
                </div>
              )}

              <div className="workflow-card-footer">
                <span className="workflow-stat">
                  运行 <strong>{automation.runCount}</strong> 次
                </span>
                <span className="workflow-stat">
                  上次 {formatLastRun(automation.lastRun)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </PageShell>
  );
}

export function NewProjectPage() {
  const router = useRouter();
  const [enterpriseName, setEnterpriseName] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function create() {
    if (!enterpriseName.trim() || !name.trim()) return;
    try {
      const project = await fetchJson<Project>("/projects", {
        method: "POST",
        body: JSON.stringify({
          enterpriseName: enterpriseName.trim(),
          name: name.trim(),
          description: description.trim() || undefined,
        }),
      });
      router.push(`/?projectId=${project.id}`);
    } catch (e) {
      console.error("创建项目失败", e);
    }
  }

  return (
    <PageShell title="新增项目" description="项目是企业下面的子集合，用来承载资料、对话、诊断和自动化。">
      <div className="page-form-grid">
        <div className="new-project-name-row">
          <input className="page-input" value={enterpriseName} onChange={(e) => setEnterpriseName(e.target.value)} placeholder="企业名称" />
          <input className="page-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="项目名称" />
        </div>
        <textarea className="page-textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="项目目标，比如：减少顾问漏跟进，提高签约转化" />
        <button className="page-primary-button" onClick={create} type="button">创建项目</button>
      </div>
    </PageShell>
  );
}

export function ProjectDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const project = workspace.projects.find((item) => item.id === id);
  const enterprise = project ? workspace.enterprises.find((item) => item.id === project.enterpriseId) : undefined;

  if (!project) {
    return <PageShell title="项目" description="正在加载项目详情。" />;
  }

  const conversations = workspace.conversations.filter((item) => item.projectId === id);
  const libraryItems = workspace.libraryItems.filter((item) => item.projectId === id);
  const automations = workspace.automations.filter((item) => item.projectId === id);
  const activeAutomations = automations.filter((a) => a.enabled);

  const typeIcon: Record<string, string> = {
    screenshot: "🖼",
    spreadsheet: "📊",
    document: "📄",
    note: "📝",
  };
  const typeClass: Record<string, string> = {
    screenshot: "image",
    spreadsheet: "sheet",
    document: "doc",
    note: "doc",
  };
  const recentConversations = [...conversations]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 4);
  const recentLibrary = [...libraryItems]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3);
  const recentAutomations = [...automations].slice(0, 3);

  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return "刚刚";
    if (min < 60) return `${min} 分钟前`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} 天前`;
    return new Date(iso).toLocaleDateString("zh-CN");
  }

  return (
    <div className="page-shell">
      {/* ── Hero Banner ── */}
      <div className="project-hero">
        <div className="project-hero-breadcrumb">
          <span className="ent-name">{enterprise?.name ?? "企业"}</span>
          <span className="sep">›</span>
          <span className="proj-name">{project.name}</span>
        </div>
        <h1 className="project-hero-title">{project.name}</h1>
        <p className="project-hero-desc">
          {project.description ?? "项目子集合，承载业务流程的诊断、资料沉淀与自动化规则。"}
        </p>
        <div className="project-hero-actions">
          <button
            className="project-hero-btn primary"
            onClick={() => router.push(`/?projectId=${project.id}`)}
            type="button"
          >
            ⚡ 开始诊断
          </button>
          <button
            className="project-hero-btn secondary"
            onClick={() => router.push("/automation")}
            type="button"
          >
            + 新建自动化
          </button>
          <button
            className="project-hero-btn secondary"
            onClick={() => router.push("/library")}
            type="button"
          >
            + 添加资料
          </button>
        </div>
      </div>

      {/* ── Metric Grid ── */}
      <div className="project-metrics">
        <div className="project-metric">
          <div className="project-metric-icon conversations">💬</div>
          <div className="project-metric-value">{conversations.length}</div>
          <div className="project-metric-label">诊断对话</div>
          {conversations.length > 0 && (
            <div className="project-metric-sub">
              最近 {timeAgo(conversations.reduce((latest, c) =>
                c.createdAt > latest ? c.createdAt : latest, conversations[0].createdAt
              ))}
            </div>
          )}
        </div>
        <div className="project-metric">
          <div className="project-metric-icon library">📚</div>
          <div className="project-metric-value">{libraryItems.length}</div>
          <div className="project-metric-label">业务资料</div>
        </div>
        <div className="project-metric">
          <div className="project-metric-icon automations">⚙</div>
          <div className="project-metric-value">{automations.length}</div>
          <div className="project-metric-label">自动化规则</div>
          {automations.length > 0 && (
            <div className="project-metric-sub">
              <span className="project-metric-indicator on" />
              <span className="highlight">{activeAutomations.length}</span> 个运行中
            </div>
          )}
        </div>

      </div>

      {/* ── Two-column Content ── */}
      <div className="project-content-grid">
        {/* Left: Recent Conversations Timeline */}
        <div className="project-section">
          <div className="project-section-header">
            <span className="project-section-title">最近对话</span>
            {conversations.length > 4 && (
              <span className="project-section-link">查看全部 →</span>
            )}
          </div>
          {recentConversations.length === 0 ? (
            <div className="project-empty">暂无诊断对话</div>
          ) : (
            <div className="project-timeline" style={{ position: "relative" }}>
              {recentConversations.length > 1 && (
                <div className="project-timeline-line" />
              )}
              {recentConversations.map((conv) => (
                <div
                  key={conv.id}
                  className="project-timeline-item"
                  onClick={() => router.push(`/chat/${conv.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") router.push(`/chat/${conv.id}`);
                  }}
                >
                  <div className="project-timeline-dot" />
                  <div className="project-timeline-content">
                    <div className="project-timeline-title">{conv.title}</div>
                    <div className="project-timeline-meta">{timeAgo(conv.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Resources & Automations */}
        <div style={{ display: "grid", gap: "14px", alignContent: "start" }}>
          {/* Library */}
          <div className="project-section">
            <div className="project-section-header">
              <span className="project-section-title">业务资料</span>
              <button
                className="project-section-link"
                onClick={() => router.push("/library")}
                type="button"
              >
                资料库 →
              </button>
            </div>
            {recentLibrary.length === 0 ? (
              <div className="project-empty">暂无业务资料</div>
            ) : (
              <div className="project-resource-list">
                {recentLibrary.map((item) => (
                  <div
                    key={item.id}
                    className="project-resource-card"
                    onClick={() => router.push("/library")}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") router.push("/library");
                    }}
                  >
                    <div className={`project-resource-icon ${typeClass[item.type]}`}>
                      {typeIcon[item.type]}
                    </div>
                    <div className="project-resource-info">
                      <div className="project-resource-name">{item.name}</div>
                      <div className="project-resource-sub">{item.type === "screenshot" ? "截图" : item.type === "spreadsheet" ? "表格" : item.type === "document" ? "文档" : "备注"}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Automations */}
          <div className="project-section">
            <div className="project-section-header">
              <span className="project-section-title">自动化规则</span>
              <button
                className="project-section-link"
                onClick={() => router.push("/automation")}
                type="button"
              >
                管理 →
              </button>
            </div>
            {recentAutomations.length === 0 ? (
              <div className="project-empty">暂无自动化规则</div>
            ) : (
              <div className="project-resource-list">
                {recentAutomations.map((auto) => (
                  <div
                    key={auto.id}
                    className="project-resource-card"
                    onClick={() => router.push("/automation")}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") router.push("/automation");
                    }}
                  >
                    <div className="project-resource-icon bot">🤖</div>
                    <div className="project-resource-info">
                      <div className="project-resource-name">{auto.name}</div>
                      <div className="project-resource-sub">
                        运行 {auto.runCount} 次
                      </div>
                    </div>
                    <span className={`project-resource-badge ${auto.enabled ? "active" : "paused"}`}>
                      {auto.enabled ? "运行中" : "已暂停"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className="project-quick-actions">
        <div
          className="project-quick-action"
          onClick={() => router.push(`/?projectId=${project.id}`)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter") router.push(`/?projectId=${project.id}`);
          }}
        >
          <span className="project-quick-action-icon">🔍</span>
          <h4>业务流程诊断</h4>
          <p>上传截图或描述流程，AI 自动分析瓶颈与优化机会</p>
        </div>
        <div
          className="project-quick-action"
          onClick={() => router.push("/library")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter") router.push("/library");
          }}
        >
          <span className="project-quick-action-icon">📁</span>
          <h4>管理项目资料</h4>
          <p>上传 Excel、截图、文档，沉淀业务知识与数据</p>
        </div>
        <div
          className="project-quick-action"
          onClick={() => router.push("/automation")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter") router.push("/automation");
          }}
        >
          <span className="project-quick-action-icon">⚡</span>
          <h4>配置自动化</h4>
          <p>设置触发规则与 AI 动作，让重复流程自动运行</p>
        </div>
      </div>
    </div>
  );
}

function PageShell({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return (
    <div className="page-shell">
      <header className="page-header">
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      {children}
    </div>
  );
}
