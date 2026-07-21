"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AgentSkill,
  Automation,
  Customer,
  Invoice,
  LibraryItem,
  Order,
  PaginatedList,
  Payment,
  Plugin,
  PluginConfigResponse,
  Product,
  Project,
  Supplier,
  ToolDefinition,
} from "shared";
import { API, fetchJson, getStoredToken } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import { useToast } from "../lib/toast-context";

import { animate, stagger, spring } from "../lib/anime";

import { AppIcon, type AppIconName } from "./AppIcon";
import { PageHeader } from "./PageHeader";
import { FormDialog } from "./FormDialog";
import { ConfirmDialog } from "./ConfirmDialog";

const searchTypes = ["项目", "对话", "资料", "自动化", "客户", "供应商", "商品", "订单", "付款", "发票"] as const;

type SearchType = typeof searchTypes[number];

type SearchItem = {
  id: string;
  type: SearchType;
  title: string;
  enterpriseId: string;
  enterpriseName: string;
  subtitle: string;
  href: string;
  keywords?: string;
};

export function SearchPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<SearchType | "全部">("全部");
  const [enterpriseFilter, setEnterpriseFilter] = useState("全部");
  const [businessItems, setBusinessItems] = useState<SearchItem[]>([]);
  const [businessLoading, setBusinessLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const currentEnterpriseId = user?.enterpriseId ?? workspace.enterprises[0]?.id;
    const enterpriseIds = currentEnterpriseId ? [currentEnterpriseId] : [];
    if (!user?.id || enterpriseIds.length === 0) {
      setBusinessItems([]);
      return;
    }

    async function loadEnterpriseIndex(enterpriseId: string): Promise<SearchItem[]> {
      const enterpriseName = workspace.enterprises.find((enterprise) => enterprise.id === enterpriseId)?.name ?? "";
      try {
        const [customers, suppliers, products, orders, payments, invoices] = await Promise.all([
          fetchJson<PaginatedList<Customer>>(`/customers?enterpriseId=${enterpriseId}&limit=50`, { adminUserId: user?.id }),
          fetchJson<PaginatedList<Supplier>>(`/suppliers?enterpriseId=${enterpriseId}&limit=50`, { adminUserId: user?.id }),
          fetchJson<PaginatedList<Product>>(`/products?enterpriseId=${enterpriseId}&limit=50`, { adminUserId: user?.id }),
          fetchJson<PaginatedList<Order>>(`/orders?enterpriseId=${enterpriseId}&limit=50`, { adminUserId: user?.id }),
          fetchJson<PaginatedList<Payment>>(`/payments?enterpriseId=${enterpriseId}&limit=50`, { adminUserId: user?.id }),
          fetchJson<PaginatedList<Invoice>>(`/invoices?enterpriseId=${enterpriseId}&limit=50`, { adminUserId: user?.id }),
        ]);

        return [
          ...customers.items.map((item) => ({
            id: item.id,
            type: "客户" as const,
            title: item.name,
            enterpriseId,
            enterpriseName,
            subtitle: [item.contact, item.phone, item.email, item.status].filter(Boolean).join(" · "),
            href: `/customers/${item.id}`,
            keywords: item.tags.join(" "),
          })),
          ...suppliers.items.map((item) => ({
            id: item.id,
            type: "供应商" as const,
            title: item.name,
            enterpriseId,
            enterpriseName,
            subtitle: [item.contact, item.phone, item.email].filter(Boolean).join(" · "),
            href: `/suppliers/${item.id}`,
          })),
          ...products.items.map((item) => ({
            id: item.id,
            type: "商品" as const,
            title: item.name,
            enterpriseId,
            enterpriseName,
            subtitle: [item.sku, item.category, item.unitPrice != null ? `¥${item.unitPrice.toFixed(2)}/${item.unit || "件"}` : ""].filter(Boolean).join(" · "),
            href: `/products/${item.id}`,
            keywords: item.description,
          })),
          ...orders.items.map((item) => ({
            id: item.id,
            type: "订单" as const,
            title: `订单 ${item.id.slice(0, 12)}`,
            enterpriseId,
            enterpriseName,
            subtitle: [`¥${item.totalAmount.toFixed(2)}`, item.status, item.createdAt?.slice(0, 10), item.notes].filter(Boolean).join(" · "),
            href: `/orders/${item.id}`,
            keywords: item.customerId ?? "",
          })),
          ...payments.items.map((item) => ({
            id: item.id,
            type: "付款" as const,
            title: `付款 ¥${item.amount.toFixed(2)}`,
            enterpriseId,
            enterpriseName,
            subtitle: [item.method, item.status, item.orderId ? `订单 ${item.orderId.slice(0, 12)}` : "", item.receivedAt?.slice(0, 10) ?? item.createdAt?.slice(0, 10)].filter(Boolean).join(" · "),
            href: `/payments/${item.id}`,
            keywords: item.orderId ?? "",
          })),
          ...invoices.items.map((item) => ({
            id: item.id,
            type: "发票" as const,
            title: `发票 ${item.invoiceNumber || item.id.slice(0, 12)}`,
            enterpriseId,
            enterpriseName,
            subtitle: [`¥${(item.totalAmount ?? item.amount).toFixed(2)}`, item.status, item.invoiceCode, item.dueDate?.slice(0, 10)].filter(Boolean).join(" · "),
            href: `/invoices/${item.id}`,
            keywords: [item.orderId, item.customerId, item.buyerName, item.sellerName, item.remark].filter(Boolean).join(" "),
          })),
        ];
      } catch {
        return [];
      }
    }

    setBusinessLoading(true);
    Promise.all(enterpriseIds.map((enterpriseId) => loadEnterpriseIndex(enterpriseId)))
      .then((groups) => {
        if (!cancelled) setBusinessItems(groups.flat());
      })
      .finally(() => {
        if (!cancelled) setBusinessLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.enterpriseId, user?.id, workspace.enterprises]);

  const workspaceItems = useMemo<SearchItem[]>(() => [
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
  ], [workspace]);

  const filteredBase = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    let filtered = [...workspaceItems, ...businessItems];
    if (keyword) {
      filtered = filtered.filter(
        (item) =>
          item.title.toLowerCase().includes(keyword) ||
          item.subtitle.toLowerCase().includes(keyword) ||
          (item.keywords ?? "").toLowerCase().includes(keyword),
      );
    }
    if (enterpriseFilter !== "全部") {
      filtered = filtered.filter((item) => item.enterpriseId === enterpriseFilter);
    }
    return filtered;
  }, [businessItems, enterpriseFilter, query, workspaceItems]);

  const results = useMemo(() => (
    typeFilter === "全部" ? filteredBase : filteredBase.filter((item) => item.type === typeFilter)
  ), [filteredBase, typeFilter]);

  const typeCounts = useMemo(() => {
    return searchTypes.reduce((acc, type) => {
      acc[type] = filteredBase.filter((item) => item.type === type).length;
      return acc;
    }, {} as Record<SearchType, number>);
  }, [filteredBase]);

  return (
    <PageShell title="全局搜索" description="在当前企业范围内统一查找资料、客户、订单、对话与自动化。">
      <div className="lib-top-bar">
        <input
          className="page-input lib-search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索线索、订单、资料或规则"
          aria-label="搜索线索、订单、资料或规则"
        />
        <button
          className="page-secondary-button"
          onClick={() => router.push("/chat/new")}
          type="button"
        >
          新建对话
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
          {searchTypes.map((t) => (
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
          <div className="search-empty">
            {businessLoading ? "正在扩展业务搜索索引..." : "没有找到匹配的结果"}
          </div>
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
  const { showToast } = useToast();
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
  const [itemToDelete, setItemToDelete] = useState<LibraryItem | null>(null);
  const [deletingItem, setDeletingItem] = useState(false);

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

  useEffect(() => {
    if (!enterpriseId && workspace.enterprises[0]) {
      setEnterpriseId(workspace.enterprises[0].id);
    }
  }, [enterpriseId, workspace.enterprises]);

  useEffect(() => {
    if (!enterpriseId) return;
    if (!projectsForEnterprise.some((project) => project.id === projectId)) {
      setProjectId(projectsForEnterprise[0]?.id ?? "");
    }
  }, [enterpriseId, projectId, projectsForEnterprise]);

  useEffect(() => {
    const cards = document.querySelectorAll(".page-card-grid .page-card");
    if (cards.length === 0) return;
    const animation = animate(".page-card-grid .page-card", {
      scale: [0.92, 1],
      opacity: [0, 1],
      y: [16, 0],
      duration: 500,
      delay: stagger(60),
      ease: spring({ mass: 1, stiffness: 80, damping: 12, velocity: 0 }),
    });
    return () => { animation?.cancel(); };
  }, [filtered]);

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
    if (!name.trim() || !summary.trim() || !enterpriseId || !projectId) return;
    const wasEditing = Boolean(editingItemId);
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
      let uploadFailed = false;
      if (selectedFile) {
        try {
          const formData = new FormData();
          formData.append("relatedType", "project");
          formData.append("relatedId", projectId);
          formData.append("file", selectedFile);
          const token = getStoredToken();
          const response = await fetch(`${API}/files/upload`, {
            method: "POST",
            body: formData,
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          });
          if (!response.ok) uploadFailed = true;
        } catch {
          uploadFailed = true;
        }
      }
      resetLibraryForm();
      await refresh();
      showToast(uploadFailed ? "资料信息已保存，但附件上传失败" : wasEditing ? "资料已更新" : "资料已添加", uploadFailed ? "error" : "success");
    } catch (e) {
      console.error(editingItemId ? "编辑资料失败" : "添加资料失败", e);
      showToast(editingItemId ? "资料保存失败" : "资料添加失败", "error");
    }
  }

  async function deleteItem() {
    if (!itemToDelete) return;
    setDeletingItem(true);
    try {
      await fetchJson(`/library/${itemToDelete.id}`, { method: "DELETE" });
      setItemToDelete(null);
      await refresh();
      showToast("资料已删除", "success");
    } catch (e) {
      console.error("删除资料失败", e);
      showToast("资料删除失败", "error");
    } finally {
      setDeletingItem(false);
    }
  }

  const typeLabel: Record<LibraryItem["type"], string> = {
    screenshot: "截图",
    spreadsheet: "表格",
    document: "文档",
    note: "备注",
  };

  return (
    <PageShell title="资料库" description="沉淀可被 Agent 检索、引用和更新的企业知识，并明确公共与项目范围。">
      {/* Search + Add */}
      <div className="lib-top-bar">
        <input
          className="page-input lib-search-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索资料名称或说明..."
          aria-label="搜索资料名称或说明..."
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
          {showForm ? <><AppIcon name="x" /> 取消</> : <><AppIcon name="plus" /> 添加资料</>}
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
                <span className="lib-file-name"><AppIcon name="file" /> {selectedFile.name}</span>
              ) : (
                <span><AppIcon name="folder" /> 选择文件上传</span>
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
          <button className="page-primary-button" onClick={saveItem} type="button" disabled={!name.trim() || !summary.trim() || !enterpriseId || !projectId}>
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
            <article className="page-card library-card" key={item.id}>
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
                  <AppIcon name="edit" />
                </button>
                <button
                  className="lib-delete-btn"
                  onClick={() => setItemToDelete(item)}
                  type="button"
                  title="删除资料"
                  aria-label={`删除资料 ${item.name}`}
                >
                  <AppIcon name="trash" />
                </button>
              </div>
              <h3>{item.name}</h3>
              <p className="library-card-summary">{item.summary}</p>
              {ent && <span className="lib-enterprise-tag">{ent.name}</span>}
            </article>
          );
        })}
      </div>
      <ConfirmDialog open={Boolean(itemToDelete)} title="删除资料" message={`确定删除资料「${itemToDelete?.name ?? ""}」吗？此操作不可撤销。`} loading={deletingItem} onConfirm={deleteItem} onCancel={() => setItemToDelete(null)} />
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
  const [pluginFields, setPluginFields] = useState<Record<string, string>>({});
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
    const fields: Record<string, string> = {};
    for (const key of config.requiredFields) {
      const val = config.fields[key];
      fields[key] = val && val !== "********" ? val : "";
    }
    setPluginFields(fields);
  }

  async function savePluginConfig() {
    if (!configPlugin) return;
    setPluginMessage("");
    try {
      await fetchJson<PluginConfigResponse>(`/plugins/${configPlugin.id}/config`, {
        method: "PATCH",
        body: JSON.stringify({ fields: pluginFields }),
      });
      setPluginMessage("配置已保存");
      await refresh();
      await openPluginConfig(configPlugin);
    } catch {
      setPluginMessage("配置保存失败");
    }
  }

  async function testPluginConfig() {
    if (!configPlugin) return;
    setPluginMessage("正在发送测试消息...");
    try {
      await fetchJson(`/plugins/${configPlugin.id}/test`, { method: "POST" });
      setPluginMessage("测试消息已发送，请到对应群聊确认");
    } catch (error) {
      setPluginMessage(error instanceof Error ? `测试失败：${error.message.slice(0, 120)}` : "测试失败");
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

  useEffect(() => {
    const cards = document.querySelectorAll(".page-card-grid .page-card, .tool-grid .page-card");
    if (cards.length === 0) return;
    const animation = animate(".page-card-grid .page-card, .tool-grid .page-card", {
      scale: [0.92, 1],
      opacity: [0, 1],
      y: [16, 0],
      duration: 500,
      delay: stagger(60),
      ease: spring({ mass: 1, stiffness: 80, damping: 12, velocity: 0 }),
    });
    return () => { animation?.cancel(); };
  }, [workspace.tools, workspace.plugins]);

  return (
    <PageShell title="插件与连接" description="管理 Agent 可用的企业系统、数据源、Skills 与业务动作。">
      <div className="integration-permission-note">
        <AppIcon name="check" />
        <div>
          <strong>权限清晰可控</strong>
          <span>Agent 仅在当前用户授权范围内调用连接；高风险写操作会进入审计日志。</span>
        </div>
      </div>
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
                      <button className="sidebar-mini-action" onClick={() => startEditSkill(skill)} title="编辑能力包" type="button" style={{ display: "inline-flex" }}><AppIcon name="edit" /></button>
                      <button className="sidebar-mini-action danger" onClick={() => removeSkill(skill.id)} title="删除能力包" type="button" style={{ display: "inline-flex" }}><AppIcon name="x" /></button>
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
                  {plugin.configured ? "修改绑定" : "绑定"}
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
              <button className="settings-close" onClick={() => setConfigPlugin(null)} type="button" aria-label="关闭插件配置"><AppIcon name="x" /></button>
            </div>
            <div className="settings-body">
              <p className="plugin-config-meta">{pluginConfig.hint}</p>
              {pluginConfig.requiredFields.map((field) => (
                <div key={field}>
                  <label className="wf-props-label">{field}</label>
                  <input
                    className="page-input"
                    value={pluginFields[field] || ""}
                    onChange={(e) => setPluginFields((prev) => ({ ...prev, [field]: e.target.value }))}
                    placeholder={field === "botId" ? "机器人的 BotID" : field === "secret" ? "长连接 Secret" : field === "webhookUrl" ? "https://open.feishu.cn/open-apis/bot/v2/hook/..." : `输入 ${field}`}
                  />
                </div>
              ))}
              <div className="settings-card-actions">
                <button className="page-primary-button" onClick={savePluginConfig} type="button">保存配置</button>
                <button className="page-secondary-button" onClick={testPluginConfig} disabled={!pluginConfig.configured} type="button">发送测试</button>
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
  const { showToast } = useToast();
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

  async function runAutomation(id: string) {
    try {
      await fetchJson<Automation>(`/automations/${id}/run`, {
        method: "POST",
        body: JSON.stringify({ source: "ui" }),
      });
      await refresh();
      showToast("自动化测试运行成功", "success");
    } catch {
      await refresh();
      showToast("自动化执行失败，请查看卡片上的失败原因", "error");
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
    tool_call: "业务工具",
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

  useEffect(() => {
    const cards = document.querySelectorAll(".workflow-card");
    if (cards.length === 0) return;
    const animation = animate(".workflow-card", {
      scale: [0.92, 1],
      opacity: [0, 1],
      y: [16, 0],
      duration: 500,
      delay: stagger(60),
      ease: spring({ mass: 1, stiffness: 80, damping: 12, velocity: 0 }),
    });
    return () => { animation?.cancel(); };
  }, [filtered]);

  return (
    <PageShell title="自动化" description="创建、测试并监控真正执行的业务工作流：触发器 + Agent + 动作。">
      {/* Search + Add */}
      <div className="lib-top-bar">
        <input
          className="page-input lib-search-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索工作流名称、触发条件或动作..."
          aria-label="搜索工作流名称、触发条件或动作..."
        />
        <button
          className="page-primary-button"
          onClick={() => router.push("/automation/workflow")}
          type="button"
        >
          <AppIcon name="plus" /> 新建工作流
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
                  <button className="page-secondary-button" onClick={() => runAutomation(automation.id)} disabled={!automation.enabled} title={automation.enabled ? "执行一次并记录结果" : "请先启用工作流"} type="button">
                    测试运行
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
                  <AppIcon name="automation" className="workflow-node-icon" />
                  <span className="workflow-node-label">{triggerLabel[automation.triggerType]}</span>
                  <span className="workflow-node-text">{automation.trigger}</span>
                </div>
                <AppIcon name="chevron" className="workflow-arrow" />
                {automation.agentModel && (
                  <>
                    <div className="workflow-node workflow-agent">
                      <AppIcon name="spark" className="workflow-node-icon" />
                      <span className="workflow-node-label">{modelLabel(automation.agentModel)}</span>
                    </div>
                    <AppIcon name="chevron" className="workflow-arrow" />
                  </>
                )}
                <div className="workflow-node workflow-action">
                  <AppIcon name="settings" className="workflow-node-icon" />
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

              {automation.triggerType === "webhook" && automation.webhookSecret && (
                <div className="workflow-webhook-info">
                  <code>POST /api/automations/{automation.id}/webhook</code>
                  <code>x-efh-webhook-secret: {automation.webhookSecret}</code>
                </div>
              )}

              <div className="workflow-card-footer">
                <span className="workflow-stat">
                  运行 <strong>{automation.runCount}</strong> 次
                </span>
                <span className="workflow-stat">
                  上次 {formatLastRun(automation.lastRun)}
                </span>
                {automation.lastStatus && (
                  <span className={`workflow-run-result ${automation.lastStatus}`} title={automation.lastError || automation.lastOutput}>
                    {automation.lastStatus === "success" ? "成功" : `失败：${automation.lastError?.slice(0, 80) || "执行器返回错误"}`}
                    {automation.lastDurationMs !== undefined ? ` · ${automation.lastDurationMs}ms` : ""}
                  </span>
                )}
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
  const { workspace, refresh } = useWorkspace();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: "", description: "" });
  const project = workspace.projects.find((item) => item.id === id);
  const enterprise = project ? workspace.enterprises.find((item) => item.id === project.enterpriseId) : undefined;

  if (!project) {
    return <PageShell title="项目" description="正在加载项目详情。" />;
  }

  const conversations = workspace.conversations.filter((item) => item.projectId === id);
  const libraryItems = workspace.libraryItems.filter((item) => item.projectId === id);
  const automations = workspace.automations.filter((item) => item.projectId === id);
  const activeAutomations = automations.filter((a) => a.enabled);

  function startProjectEdit() {
    if (!project) return;
    setProjectForm({ name: project.name, description: project.description ?? "" });
    setEditing(true);
  }

  async function saveProject() {
    if (!projectForm.name.trim()) return;
    setSaving(true);
    try {
      await fetchJson(`/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: projectForm.name.trim(), description: projectForm.description.trim() }),
      });
      await refresh();
      setEditing(false);
      showToast("项目信息已更新", "success");
    } catch { showToast("项目信息保存失败", "error"); }
    finally { setSaving(false); }
  }

  async function deleteProject() {
    setDeleting(true);
    try {
      await fetchJson(`/projects/${id}`, { method: "DELETE" });
      await refresh();
      showToast("项目已删除", "success");
      router.push("/projects");
    } catch { showToast("项目删除失败", "error"); }
    finally { setDeleting(false); setDeleteOpen(false); }
  }

  const typeIcon: Record<string, AppIconName> = {
    screenshot: "image",
    spreadsheet: "table",
    document: "document",
    note: "edit",
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
            <AppIcon name="automation" /> 开始诊断
          </button>
          <button
            className="project-hero-btn secondary"
            onClick={() => router.push("/automation")}
            type="button"
          >
            <AppIcon name="plus" /> 新建自动化
          </button>
          <button
            className="project-hero-btn secondary"
            onClick={() => router.push("/library")}
            type="button"
          >
            <AppIcon name="plus" /> 添加资料
          </button>
          <button className="project-hero-btn secondary" onClick={startProjectEdit} type="button">
            <AppIcon name="edit" /> 编辑项目
          </button>
          <button className="project-hero-btn secondary danger" onClick={() => setDeleteOpen(true)} type="button">
            <AppIcon name="trash" /> 删除项目
          </button>
        </div>
      </div>

      {/* ── Metric Grid ── */}
      <div className="project-metrics">
        <div className="project-metric">
          <div className="project-metric-icon conversations"><AppIcon name="chat" /></div>
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
          <div className="project-metric-icon library"><AppIcon name="library" /></div>
          <div className="project-metric-value">{libraryItems.length}</div>
          <div className="project-metric-label">业务资料</div>
        </div>
        <div className="project-metric">
          <div className="project-metric-icon automations"><AppIcon name="settings" /></div>
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
              <button className="project-section-link" onClick={() => router.push(`/?projectId=${project.id}`)} type="button">查看全部 <AppIcon name="chevron" className="inline-flow-arrow" /></button>
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
                资料库 <AppIcon name="chevron" className="inline-flow-arrow" />
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
                      <AppIcon name={typeIcon[item.type]} />
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
                管理 <AppIcon name="chevron" className="inline-flow-arrow" />
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
                    <div className="project-resource-icon bot"><AppIcon name="spark" /></div>
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
          <AppIcon name="search" className="project-quick-action-icon" />
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
          <AppIcon name="folder" className="project-quick-action-icon" />
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
          <AppIcon name="automation" className="project-quick-action-icon" />
          <h4>配置自动化</h4>
          <p>设置触发规则与 AI 动作，让重复流程自动运行</p>
        </div>
      </div>
      <FormDialog open={editing} title={`编辑项目：${project.name}`} saving={saving} submitDisabled={!projectForm.name.trim()} onSubmit={saveProject} onCancel={() => setEditing(false)}>
        <label className="form-label" htmlFor="edit-project-name">项目名称 *</label>
        <input id="edit-project-name" className="page-input" autoFocus value={projectForm.name} onChange={(event) => setProjectForm((current) => ({ ...current, name: event.target.value }))} />
        <label className="form-label" htmlFor="edit-project-description">项目说明</label>
        <textarea id="edit-project-description" className="page-textarea" maxLength={300} value={projectForm.description} onChange={(event) => setProjectForm((current) => ({ ...current, description: event.target.value }))} />
      </FormDialog>
      <ConfirmDialog open={deleteOpen} title="删除项目" message={`确定删除项目「${project.name}」吗？项目下的对话、资料和自动化也会一并删除，此操作不可撤销。`} loading={deleting} onConfirm={deleteProject} onCancel={() => setDeleteOpen(false)} />
    </div>
  );
}

function PageShell({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return (
    <div className="page-shell">
      <PageHeader title={title} description={description} />
      {children}
    </div>
  );
}
