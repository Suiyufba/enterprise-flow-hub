"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { useToast } from "../../lib/toast-context";
import type { Customer } from "shared";

export default function NewCustomerPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { workspace, refresh } = useWorkspace();
  const { showToast } = useToast();
  const enterpriseId = user?.enterpriseId ?? workspace.enterprises[0]?.id;
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<Customer["status"]>("active");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !enterpriseId) return;
    setSaving(true);
    try {
      await fetchJson<Customer>("/customers", {
        method: "POST",
        body: JSON.stringify({
          enterpriseId,
          name: name.trim(),
          contact: contact.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          address: address.trim() || undefined,
          status,
        }),
        adminUserId: user?.id,
      });
      showToast("客户已创建", "success");
      await refresh();
      router.push("/customers");
    } catch {
      showToast("创建失败", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
      <div className="page-shell">
        <div className="page-header">
          <h1>新建客户</h1>
          <p>添加新的客户信息</p>
        </div>

        <form onSubmit={handleSubmit} className="page-form-grid" style={{ maxWidth: 560 }}>
          <label className="form-label" htmlFor="new-customer-name">名称 *</label>
          <input id="new-customer-name" className="page-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="客户名称" required />

          <label className="form-label" htmlFor="new-customer-contact">联系人</label>
          <input id="new-customer-contact" className="page-input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="主要联系人" />

          <label className="form-label" htmlFor="new-customer-phone">电话</label>
          <input id="new-customer-phone" className="page-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="联系电话" />

          <label className="form-label" htmlFor="new-customer-email">邮箱</label>
          <input id="new-customer-email" className="page-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="电子邮箱" />

          <label className="form-label" htmlFor="new-customer-address">地址</label>
          <input id="new-customer-address" className="page-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="地址" />

          <label className="form-label" htmlFor="new-customer-status">状态</label>
          <select id="new-customer-status" className="page-input" value={status} onChange={(e) => setStatus(e.target.value as Customer["status"])}>
            <option value="active">活跃</option>
            <option value="inactive">非活跃</option>
            <option value="lead">潜在</option>
            <option value="lost">已流失</option>
          </select>

          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button className="page-primary-button" type="submit" disabled={saving || !name.trim()}>
              {saving ? "保存中..." : "创建客户"}
            </button>
            <button className="page-secondary-button" type="button" onClick={() => router.back()}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}
