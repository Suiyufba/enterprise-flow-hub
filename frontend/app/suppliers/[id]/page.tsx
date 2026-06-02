"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import type { Supplier } from "shared";

export default function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchJson<Supplier>(`/suppliers/${id}`, { adminUserId: user?.id })
      .then((data) => {
        setSupplier(data);
        setName(data.name);
        setContact(data.contact);
        setPhone(data.phone);
        setEmail(data.email);
        setAddress(data.address);
      })
      .catch(() => {
        setError("加载供应商信息失败，请检查网络连接后重试");
        showToast("加载供应商信息失败", "error");
      })
      .finally(() => setLoading(false));
  }, [id, user?.id, showToast]);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const updated = await fetchJson<Supplier>(`/suppliers/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          contact: contact.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          address: address.trim() || undefined,
        }),
        adminUserId: user?.id,
      });
      setSupplier(updated);
      setEditing(false);
      showToast("已保存", "success");
    } catch { showToast("保存失败", "error"); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetchJson(`/suppliers/${id}`, { method: "DELETE", adminUserId: user?.id });
      showToast("已删除", "success");
      router.push("/suppliers");
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

  if (error) {
    return (
      <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
        <div className="page-shell">
          <p style={{ color: "var(--c-ff3b30)", textAlign: "center", padding: 48 }}>{error}</p>
          <div style={{ textAlign: "center" }}>
            <button className="page-primary-button" onClick={() => { setError(null); setLoading(true); window.location.reload(); }}>
              重试
            </button>
            <span style={{ margin: "0 10px" }} />
            <button className="page-secondary-button" onClick={() => router.push("/suppliers")}>返回列表</button>
          </div>
        </div>
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
        <div className="page-shell">
          <p style={{ color: "var(--c-8c8c8c)", textAlign: "center", padding: 48 }}>供应商不存在</p>
          <div style={{ textAlign: "center" }}>
            <button className="page-secondary-button" onClick={() => router.push("/suppliers")}>返回列表</button>
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
            <button className="chat-back" onClick={() => router.push("/suppliers")} type="button" aria-label="返回列表">←</button>
            <h1>{editing ? "编辑供应商" : supplier.name}</h1>
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
            <label className="form-label" htmlFor="supplier-name">名称 *</label>
            <input id="supplier-name" className="page-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="供应商名称" />

            <label className="form-label" htmlFor="supplier-contact">联系人</label>
            <input id="supplier-contact" className="page-input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="联系人" />

            <label className="form-label" htmlFor="supplier-phone">电话</label>
            <input id="supplier-phone" className="page-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="电话" />

            <label className="form-label" htmlFor="supplier-email">邮箱</label>
            <input id="supplier-email" className="page-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="邮箱" />

            <label className="form-label" htmlFor="supplier-address">地址</label>
            <input id="supplier-address" className="page-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="地址" />

            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button className="page-primary-button" onClick={handleSave} disabled={saving || !name.trim()}>
                {saving ? "保存中..." : "保存"}
              </button>
              <button className="page-secondary-button" onClick={() => {
                setName(supplier.name); setContact(supplier.contact);
                setPhone(supplier.phone); setEmail(supplier.email); setAddress(supplier.address);
                setEditing(false);
              }}>取消</button>
            </div>
          </div>
        ) : (
          <div className="settings-list">
            <div className="settings-card">
              <div><strong>联系人</strong></div>
              <span className="settings-meta">{supplier.contact || "未设置"}</span>
            </div>
            <div className="settings-card">
              <div><strong>电话</strong></div>
              <span className="settings-meta">{supplier.phone || "未设置"}</span>
            </div>
            <div className="settings-card">
              <div><strong>邮箱</strong></div>
              <span className="settings-meta">{supplier.email || "未设置"}</span>
            </div>
            <div className="settings-card">
              <div><strong>地址</strong></div>
              <span className="settings-meta">{supplier.address || "未设置"}</span>
            </div>
            <div className="settings-card">
              <div><strong>创建时间</strong></div>
              <span className="settings-meta">{supplier.createdAt}</span>
            </div>
          </div>
        )}

        {deleteConfirm && (
          <div className="settings-overlay" onClick={() => setDeleteConfirm(false)}>
            <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
              <div className="settings-header">
                <h2>确认删除</h2>
                <button className="settings-close" onClick={() => setDeleteConfirm(false)} type="button" aria-label="关闭">×</button>
              </div>
              <div className="settings-body">
                <p>确定要删除供应商「{supplier.name}」吗？此操作不可撤销。</p>
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
