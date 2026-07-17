"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchJson } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import { useToast } from "../lib/toast-context";
import { PageHeader } from "../components/PageHeader";
import { SearchInput } from "../components/SearchInput";
import { ErrorState } from "../components/ErrorState";
import { DataTable } from "../components/DataTable";
import { AppIcon } from "../components/AppIcon";
import { TableRowActions } from "../components/TableRowActions";
import { FormDialog } from "../components/FormDialog";
import { EnterpriseBadge, EnterpriseScopeSelect, ProjectBadge, ProjectScopeSelect } from "../components/ProjectScopeSelect";
import type { Product, PaginatedList } from "shared";

export default function ProductsPage() {
  const { user } = useAuth();
  const { workspace, refresh } = useWorkspace();
  const { showToast } = useToast();
  const [enterpriseFilter, setEnterpriseFilter] = useState("");
  const enterprises = user?.role === "admin" ? workspace.enterprises : workspace.enterprises.filter((enterprise) => enterprise.id === user?.enterpriseId);
  const enterpriseId = enterpriseFilter || user?.enterpriseId || enterprises[0]?.id;
  const projects = workspace.projects.filter((project) => project.enterpriseId === enterpriseId);
  const [data, setData] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState({ enterpriseId: "", projectId: "", name: "", sku: "", category: "", unitPrice: "", unit: "", description: "" });
  const [editSaving, setEditSaving] = useState(false);
  useEffect(() => { if (!enterpriseFilter && user?.enterpriseId) setEnterpriseFilter(user.enterpriseId); }, [enterpriseFilter, user?.enterpriseId]);
  const load = useCallback(async () => {
    if (!enterpriseId) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ enterpriseId, page: String(page), limit: "20" });
      if (search) params.set("search", search);
      if (category) params.set("category", category);
      if (projectFilter) params.set("projectId", projectFilter);
      const res = await fetchJson<PaginatedList<Product>>(`/products?${params}`, { adminUserId: user?.id });
      setData(res.items);
      setTotal(res.total);
    } catch {
      setError("加载失败，请检查网络后重试");
      showToast("加载失败", "error");
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, page, search, category, projectFilter, showToast, user?.id]);

  useEffect(() => { load(); }, [load]);

  function startEdit(product: Product) {
    setEditingProduct(product);
    setEditForm({
      enterpriseId: product.enterpriseId,
      projectId: product.projectId,
      name: product.name, sku: product.sku, category: product.category,
      unitPrice: String(product.unitPrice), unit: product.unit, description: product.description,
    });
  }

  async function saveProduct() {
    const price = Number(editForm.unitPrice);
    if (!editingProduct || !editForm.enterpriseId || !editForm.projectId || !editForm.name.trim() || !Number.isFinite(price) || price < 0) return;
    setEditSaving(true);
    try {
      await fetchJson(`/products/${editingProduct.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          enterpriseId: editForm.enterpriseId,
          projectId: editForm.projectId,
          name: editForm.name.trim(), sku: editForm.sku.trim(), category: editForm.category.trim(),
          unitPrice: price, unit: editForm.unit.trim(), description: editForm.description.trim(),
        }),
        adminUserId: user?.id,
      });
      setEditingProduct(null);
      showToast("商品信息已更新", "success");
      await load();
    } catch { showToast("商品信息保存失败", "error"); }
    finally { setEditSaving(false); }
  }

  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [sku, setSku] = useState("");
  const [cat, setCat] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [unit, setUnit] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function createProduct() {
    const price = parseFloat(unitPrice);
    if (!name.trim() || !enterpriseId || !projectId || (unitPrice && (isNaN(price) || price <= 0))) return;
    setSaving(true);
    try {
      await fetchJson("/products", {
        method: "POST",
        body: JSON.stringify({
          enterpriseId,
          projectId,
          name: name.trim(),
          sku: sku.trim() || undefined,
          category: cat.trim() || undefined,
          unitPrice: unitPrice && !isNaN(parseFloat(unitPrice)) && parseFloat(unitPrice) > 0 ? parseFloat(unitPrice) : undefined,
          unit: unit.trim() || undefined,
          description: description.trim() || undefined,
        }),
        adminUserId: user?.id,
      });
      setName(""); setProjectId(""); setSku(""); setCat(""); setUnitPrice(""); setUnit(""); setDescription("");
      setShowForm(false);
      showToast("商品已添加", "success");
      await load();
      await refresh();
    } catch { showToast("添加失败", "error"); }
    finally { setSaving(false); }
  }

  const columns = [
    {
      key: "name",
      label: "名称",
      render: (p: Product) => (
        <Link href={`/products/${p.id}`} style={{ color: "var(--c-f0f0f0)", fontWeight: 600, textDecoration: "none" }}>
          {p.name}
        </Link>
      ),
    },
    { key: "sku", label: "SKU" },
    { key: "enterpriseId", label: "所属企业", render: (p: Product) => <EnterpriseBadge enterprises={workspace.enterprises} enterpriseId={p.enterpriseId} /> },
    { key: "projectId", label: "业务子类", render: (p: Product) => <ProjectBadge projects={workspace.projects} projectId={p.projectId} /> },
    { key: "category", label: "分类" },
    { key: "unitPrice", label: "单价", render: (p: Product) => `¥${p.unitPrice.toFixed(2)}/${p.unit}` },
    {
      key: "actions",
      label: "操作",
      width: "150px",
      render: (p: Product) => <TableRowActions viewHref={`/products/${p.id}`} onEdit={() => startEdit(p)} />,
    },
  ];

  return (
    <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
      <div className="page-shell">
        <PageHeader
          title="商品管理"
          description="管理所有商品和服务"
          actions={
            <button className="page-primary-button" onClick={() => setShowForm(!showForm)} type="button" style={{ border: 0, borderRadius: "10px", fontSize: "14px", fontWeight: 700, cursor: "pointer", padding: "10px 18px", background: "var(--c-f0f0f0)", color: "var(--c-181818)" }}>
              {showForm ? <><AppIcon name="x" /> 取消</> : <><AppIcon name="plus" /> 新建商品</>}
            </button>
          }
        />

        {showForm && (
          <div className="settings-card" style={{ marginBottom: 14, borderColor: "var(--c-4a90e6)" }}>
            <div className="settings-edit-form">
              <label htmlFor="new-product-enterprise">所属企业 *</label>
              <EnterpriseScopeSelect id="new-product-enterprise" enterprises={enterprises} value={enterpriseId ?? ""} onChange={(value) => { setEnterpriseFilter(value); setProjectId(""); }} className="page-input" ariaLabel="商品所属企业" />
              <label htmlFor="new-product-project">业务子类 *</label>
              <ProjectScopeSelect id="new-product-project" projects={projects} value={projectId} onChange={setProjectId} includeAll={false} className="page-input" ariaLabel="商品业务子类" />
              <label htmlFor="new-product-name">名称 *</label>
              <input id="new-product-name" className="page-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="商品名称 *" />
              <label htmlFor="new-product-sku">SKU</label>
              <input id="new-product-sku" className="page-input" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU" />
              <label htmlFor="new-product-category">分类</label>
              <input id="new-product-category" className="page-input" value={cat} onChange={(e) => setCat(e.target.value)} placeholder="分类" />
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label htmlFor="new-product-unit-price">单价</label>
                  <input id="new-product-unit-price" className="page-input" type="number" step="0.01" min="0" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="单价" style={{ width: "100%" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label htmlFor="new-product-unit">单位</label>
                  <input id="new-product-unit" className="page-input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="单位（如：个/箱）" style={{ width: "100%" }} />
                </div>
              </div>
              <label htmlFor="new-product-description">描述</label>
              <input id="new-product-description" className="page-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="描述" />
              <button className="page-primary-button" onClick={createProduct} disabled={saving || !name.trim() || !enterpriseId || !projectId || (unitPrice !== "" && (isNaN(parseFloat(unitPrice)) || parseFloat(unitPrice) <= 0))} type="button">
                {saving ? "添加中..." : "确认添加"}
              </button>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: "10px", marginBottom: "14px" }}>
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="搜索商品..." />
          <EnterpriseScopeSelect enterprises={enterprises} value={enterpriseId ?? ""} onChange={(value) => { setEnterpriseFilter(value); setProjectFilter(""); setPage(1); }} ariaLabel="按所属企业筛选" />
          <ProjectScopeSelect projects={projects} value={projectFilter} onChange={(value) => { setProjectFilter(value); setPage(1); }} />
          <select className="search-enterprise-select" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
            <option value="">全部分类</option>
            {[...new Set(data.map((p) => p.category).filter(Boolean))].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <DataTable
            className="erp-table-wrap"
            columns={columns}
            data={data}
            loading={loading}
            total={total}
            page={page}
            onPageChange={setPage}
            emptyTitle="暂无商品"
            emptyDesc="还没有添加任何商品"
            emptyAction={<button className="page-primary-button" onClick={() => setShowForm(true)} type="button">新建商品</button>}
          />
        )}
        <FormDialog open={Boolean(editingProduct)} title={`编辑商品${editingProduct ? `：${editingProduct.name}` : ""}`} saving={editSaving} submitDisabled={!editForm.enterpriseId || !editForm.projectId || !editForm.name.trim() || !Number.isFinite(Number(editForm.unitPrice)) || Number(editForm.unitPrice) < 0} onSubmit={saveProduct} onCancel={() => setEditingProduct(null)}>
          <label className="form-label" htmlFor="edit-product-enterprise">所属企业 *</label>
          <EnterpriseScopeSelect id="edit-product-enterprise" enterprises={enterprises} value={editForm.enterpriseId} onChange={(enterpriseId) => setEditForm((current) => ({ ...current, enterpriseId, projectId: "" }))} className="page-input" ariaLabel="商品所属企业" />
          <label className="form-label" htmlFor="edit-product-project">业务子类 *</label>
          <ProjectScopeSelect id="edit-product-project" projects={workspace.projects.filter((project) => project.enterpriseId === editForm.enterpriseId)} value={editForm.projectId} onChange={(projectId) => setEditForm((current) => ({ ...current, projectId }))} includeAll={false} className="page-input" ariaLabel="商品业务子类" />
          <label className="form-label" htmlFor="edit-product-name">商品名称 *</label>
          <input id="edit-product-name" className="page-input" autoFocus value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} />
          <label className="form-label" htmlFor="edit-product-sku">SKU</label>
          <input id="edit-product-sku" className="page-input" value={editForm.sku} onChange={(event) => setEditForm((current) => ({ ...current, sku: event.target.value }))} />
          <label className="form-label" htmlFor="edit-product-category">分类</label>
          <input id="edit-product-category" className="page-input" value={editForm.category} onChange={(event) => setEditForm((current) => ({ ...current, category: event.target.value }))} />
          <label className="form-label" htmlFor="edit-product-price">单价</label>
          <input id="edit-product-price" className="page-input" type="number" min="0" step="0.01" value={editForm.unitPrice} onChange={(event) => setEditForm((current) => ({ ...current, unitPrice: event.target.value }))} />
          <label className="form-label" htmlFor="edit-product-unit">单位</label>
          <input id="edit-product-unit" className="page-input" value={editForm.unit} onChange={(event) => setEditForm((current) => ({ ...current, unit: event.target.value }))} />
          <label className="form-label" htmlFor="edit-product-description">描述</label>
          <textarea id="edit-product-description" className="page-textarea" value={editForm.description} onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))} />
        </FormDialog>
      </div>
    </div>
  );
}
