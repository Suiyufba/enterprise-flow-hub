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
import type { Product, PaginatedList } from "shared";

export default function ProductsPage() {
  const { user } = useAuth();
  const { workspace, refresh } = useWorkspace();
  const { showToast } = useToast();
  const enterpriseId = user?.enterpriseId ?? workspace.enterprises[0]?.id;
  const [data, setData] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!enterpriseId) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ enterpriseId, page: String(page), limit: "20" });
      if (search) params.set("search", search);
      if (category) params.set("category", category);
      const res = await fetchJson<PaginatedList<Product>>(`/products?${params}`, { adminUserId: user?.id });
      setData(res.items);
      setTotal(res.total);
    } catch {
      setError("加载失败，请检查网络后重试");
      showToast("加载失败", "error");
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, page, search, category, showToast, user?.id]);

  useEffect(() => { load(); }, [load]);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [cat, setCat] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [unit, setUnit] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function createProduct() {
    const price = parseFloat(unitPrice);
    if (!name.trim() || !enterpriseId || (unitPrice && (isNaN(price) || price <= 0))) return;
    setSaving(true);
    try {
      await fetchJson("/products", {
        method: "POST",
        body: JSON.stringify({
          enterpriseId,
          name: name.trim(),
          sku: sku.trim() || undefined,
          category: cat.trim() || undefined,
          unitPrice: unitPrice && !isNaN(parseFloat(unitPrice)) && parseFloat(unitPrice) > 0 ? parseFloat(unitPrice) : undefined,
          unit: unit.trim() || undefined,
          description: description.trim() || undefined,
        }),
        adminUserId: user?.id,
      });
      setName(""); setSku(""); setCat(""); setUnitPrice(""); setUnit(""); setDescription("");
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
    { key: "category", label: "分类" },
    { key: "unitPrice", label: "单价", render: (p: Product) => `¥${p.unitPrice.toFixed(2)}/${p.unit}` },
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
              <button className="page-primary-button" onClick={createProduct} disabled={saving || !name.trim() || (unitPrice !== "" && (isNaN(parseFloat(unitPrice)) || parseFloat(unitPrice) <= 0))} type="button">
                {saving ? "添加中..." : "确认添加"}
              </button>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: "10px", marginBottom: "14px" }}>
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="搜索商品..." />
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
      </div>
    </div>
  );
}
