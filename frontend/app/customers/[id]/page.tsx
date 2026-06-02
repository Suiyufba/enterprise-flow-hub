"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import type { Customer } from "shared";

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<Customer["status"]>("active");
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchJson<Customer>(`/customers/${id}`, { adminUserId: user?.id })
      .then((data) => {
        setCustomer(data);
        setName(data.name);
        setContact(data.contact);
        setPhone(data.phone);
        setEmail(data.email);
        setAddress(data.address);
        setStatus(data.status);
      })
      .catch(() => {
        setError("加载客户信息失败，请检查网络连接后重试");
        showToast("加载客户信息失败", "error");
      })
      .finally(() => setLoading(false));
  }, [id, user?.id, showToast]);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const updated = await fetchJson<Customer>(`/customers/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          contact: contact.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          address: address.trim() || undefined,
          status,
        }),
        adminUserId: user?.id,
      });
      setCustomer(updated);
      setEditing(false);
      showToast("已保存", "success");
    } catch {
      showToast("保存失败", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetchJson(`/customers/${id}`, { method: "DELETE", adminUserId: user?.id });
      showToast("已删除", "success");
      router.push("/customers");
    } catch {
      showToast("删除失败", "error");
    } finally {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  }

  if (loading) {
    return (
      <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
        <div className="page-shell">
          <div className="loading"><div className="spinner" /></div>
        </div>
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
            <button className="page-secondary-button" onClick={() => router.push("/customers")}>返回列表</button>
          </div>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
        <div className="page-shell">
          <p style={{ color: "var(--c-8c8c8c)", textAlign: "center", padding: 48 }}>客户不存在</p>
          <div style={{ textAlign: "center" }}>
            <button className="page-secondary-button" onClick={() => router.push("/customers")}>返回列表</button>
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
            <button className="chat-back" onClick={() => router.push("/customers")} type="button" aria-label="返回列表">←</button>
            <h1>{editing ? "编辑客户" : customer.name}</h1>
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
            <label className="form-label" htmlFor="customer-name">名称 *</label>
            <input id="customer-name" className="page-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="客户名称" />

            <label className="form-label" htmlFor="customer-contact">联系人</label>
            <input id="customer-contact" className="page-input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="主要联系人" />

            <label className="form-label" htmlFor="customer-phone">电话</label>
            <input id="customer-phone" className="page-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="联系电话" />

            <label className="form-label" htmlFor="customer-email">邮箱</label>
            <input id="customer-email" className="page-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="电子邮箱" />

            <label className="form-label" htmlFor="customer-address">地址</label>
            <input id="customer-address" className="page-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="地址" />

            <label className="form-label" htmlFor="customer-status">状态</label>
            <select id="customer-status" className="page-input" value={status} onChange={(e) => setStatus(e.target.value as Customer["status"])}>
              <option value="active">活跃</option>
              <option value="inactive">非活跃</option>
              <option value="lead">潜在</option>
              <option value="lost">已流失</option>
            </select>

            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button className="page-primary-button" onClick={handleSave} disabled={saving || !name.trim()}>
                {saving ? "保存中..." : "保存"}
              </button>
              <button className="page-secondary-button" onClick={() => {
                setName(customer.name);
                setContact(customer.contact);
                setPhone(customer.phone);
                setEmail(customer.email);
                setAddress(customer.address);
                setStatus(customer.status);
                setEditing(false);
              }}>取消</button>
            </div>
          </div>
        ) : (
          <div className="settings-list">
            <div className="settings-card">
              <div><strong>联系人</strong></div>
              <span className="settings-meta">{customer.contact || "未设置"}</span>
            </div>
            <div className="settings-card">
              <div><strong>电话</strong></div>
              <span className="settings-meta">{customer.phone || "未设置"}</span>
            </div>
            <div className="settings-card">
              <div><strong>邮箱</strong></div>
              <span className="settings-meta">{customer.email || "未设置"}</span>
            </div>
            <div className="settings-card">
              <div><strong>地址</strong></div>
              <span className="settings-meta">{customer.address || "未设置"}</span>
            </div>
            <div className="settings-card">
              <div><strong>状态</strong></div>
              <span className={`settings-status ${customer.status === "active" ? "on" : "off"}`}>
                {customer.status === "active" ? "活跃" : customer.status === "inactive" ? "非活跃" : customer.status === "lead" ? "潜在" : "已流失"}
              </span>
            </div>
            <div className="settings-card">
              <div><strong>创建时间</strong></div>
              <span className="settings-meta">{customer.createdAt}</span>
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
                <p>确定要删除客户「{customer.name}」吗？此操作不可撤销。</p>
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
