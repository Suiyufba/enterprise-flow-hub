"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import type { Product } from "shared";

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [unit, setUnit] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchJson<Product>(`/products/${id}`, { adminUserId: user?.id })
      .then((data) => {
        setProduct(data);
        setName(data.name);
        setSku(data.sku);
        setCategory(data.category);
        setUnitPrice(String(data.unitPrice));
        setUnit(data.unit);
        setDescription(data.description);
      })
      .catch(() => showToast("加载商品信息失败", "error"))
      .finally(() => setLoading(false));
  }, [id, user?.id, showToast]);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const updated = await fetchJson<Product>(`/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          sku: sku.trim() || undefined,
          category: category.trim() || undefined,
          unitPrice: unitPrice ? parseFloat(unitPrice) : undefined,
          unit: unit.trim() || undefined,
          description: description.trim() || undefined,
        }),
        adminUserId: user?.id,
      });
      setProduct(updated);
      setEditing(false);
      showToast("已保存", "success");
    } catch { showToast("保存失败", "error"); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetchJson(`/products/${id}`, { method: "DELETE", adminUserId: user?.id });
      showToast("已删除", "success");
      router.push("/products");
    } catch { showToast("删除失败", "error"); }
    finally { setDeleting(false); setDeleteConfirm(false); }
  }

  if (loading) {
    return (
      <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
        <div className="page-shell"><div className="loading"><div className="spinner" /></div></div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
        <div className="page-shell">
          <p style={{ color: "var(--c-8c8c8c)", textAlign: "center", padding: 48 }}>商品不存在</p>
          <div style={{ textAlign: "center" }}>
            <button className="page-secondary-button" onClick={() => router.push("/products")}>返回列表</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
      <div className="page-shell">
        <div className="page-header">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button className="chat-back" onClick={() => router.push("/products")} type="button">←</button>
            <h1>{editing ? "编辑商品" : product.name}</h1>
          </div>
          {!editing && (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="page-secondary-button" onClick={() => setEditing(true)}>编辑</button>
              <button className="page-secondary-button" onClick={() => setDeleteConfirm(true)} style={{ color: "var(--c-ff3b30)" }}>删除</button>
            </div>
          )}
        </div>

        {editing ? (
          <div className="page-form-grid" style={{ maxWidth: 560 }}>
            <label className="form-label">名称 *</label>
            <input className="page-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="商品名称" />

            <label className="form-label">SKU</label>
            <input className="page-input" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU" />

            <label className="form-label">分类</label>
            <input className="page-input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="分类" />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label className="form-label">单价</label>
                <input className="page-input" type="number" step="0.01" min="0" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="单价" />
              </div>
              <div>
                <label className="form-label">单位</label>
                <input className="page-input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="个/箱/件" />
              </div>
            </div>

            <label className="form-label">描述</label>
            <input className="page-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="描述" />

            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button className="page-primary-button" onClick={handleSave} disabled={saving || !name.trim()}>
                {saving ? "保存中..." : "保存"}
              </button>
              <button className="page-secondary-button" onClick={() => {
                setName(product.name); setSku(product.sku); setCategory(product.category);
                setUnitPrice(String(product.unitPrice)); setUnit(product.unit); setDescription(product.description);
                setEditing(false);
              }}>取消</button>
            </div>
          </div>
        ) : (
          <div className="settings-list">
            <div className="settings-card">
              <div><strong>SKU</strong></div>
              <span className="settings-meta">{product.sku || "未设置"}</span>
            </div>
            <div className="settings-card">
              <div><strong>分类</strong></div>
              <span className="settings-meta">{product.category || "未设置"}</span>
            </div>
            <div className="settings-card">
              <div><strong>单价</strong></div>
              <span className="settings-meta">¥{product.unitPrice.toFixed(2)} / {product.unit}</span>
            </div>
            <div className="settings-card">
              <div><strong>描述</strong></div>
              <span className="settings-meta">{product.description || "未设置"}</span>
            </div>
            <div className="settings-card">
              <div><strong>创建时间</strong></div>
              <span className="settings-meta">{product.createdAt}</span>
            </div>
          </div>
        )}

        {deleteConfirm && (
          <div className="settings-overlay" onClick={() => setDeleteConfirm(false)}>
            <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
              <div className="settings-header">
                <h2>确认删除</h2>
                <button className="settings-close" onClick={() => setDeleteConfirm(false)} type="button">×</button>
              </div>
              <div className="settings-body">
                <p>确定要删除商品「{product.name}」吗？此操作不可撤销。</p>
                <div className="settings-card-actions">
                  <button className="page-secondary-button" onClick={() => setDeleteConfirm(false)} disabled={deleting}>取消</button>
                  <button className="page-primary-button" onClick={handleDelete} disabled={deleting} style={{ background: "var(--c-d20f39)", color: "#fff" }}>
                    {deleting ? "删除中..." : "确认删除"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
