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
import type { Supplier, PaginatedList } from "shared";

export default function SuppliersPage() {
  const { user } = useAuth();
  const { workspace, refresh } = useWorkspace();
  const { showToast } = useToast();
  const enterpriseId = user?.enterpriseId ?? workspace.enterprises[0]?.id;
  const [data, setData] = useState<Supplier[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
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
      const res = await fetchJson<PaginatedList<Supplier>>(`/suppliers?${params}`, { adminUserId: user?.id });
      setData(res.items);
      setTotal(res.total);
    } catch {
      setError("加载失败，请检查网络后重试");
      showToast("加载失败", "error");
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, page, search, showToast, user?.id]);

  useEffect(() => { load(); }, [load]);

  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);

  async function createSupplier() {
    if (!name.trim() || !enterpriseId) return;
    setSaving(true);
    try {
      await fetchJson("/suppliers", {
        method: "POST",
        body: JSON.stringify({
          enterpriseId,
          name: name.trim(),
          contact: contact.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          address: address.trim() || undefined,
        }),
        adminUserId: user?.id,
      });
      setName(""); setContact(""); setPhone(""); setEmail(""); setAddress("");
      setShowForm(false);
      showToast("供应商已添加", "success");
      await load();
      await refresh();
    } catch { showToast("添加失败", "error"); }
    finally { setSaving(false); }
  }

  const columns = [
    {
      key: "name",
      label: "名称",
      render: (s: Supplier) => (
        <Link href={`/suppliers/${s.id}`} style={{ color: "var(--c-f0f0f0)", fontWeight: 600, textDecoration: "none" }}>
          {s.name}
        </Link>
      ),
    },
    { key: "contact", label: "联系人" },
    { key: "phone", label: "电话" },
    { key: "email", label: "邮箱" },
  ];

  return (
    <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
      <div className="page-shell">
        <PageHeader
          title="供应商管理"
          description="管理所有供应商信息"
          actions={
            <button className="page-primary-button" onClick={() => setShowForm(!showForm)} type="button" style={{ border: 0, borderRadius: "10px", fontSize: "14px", fontWeight: 700, cursor: "pointer", padding: "10px 18px", background: "var(--c-f0f0f0)", color: "var(--c-181818)" }}>
              {showForm ? "取消" : "+ 新建供应商"}
            </button>
          }
        />

        {showForm && (
          <div className="settings-card" style={{ marginBottom: 14, borderColor: "var(--c-4a90e6)" }}>
            <div className="settings-edit-form">
              <input className="page-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="供应商名称 *" />
              <input className="page-input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="联系人" />
              <input className="page-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="电话" />
              <input className="page-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="邮箱" />
              <input className="page-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="地址" />
              <button className="page-primary-button" onClick={createSupplier} disabled={saving || !name.trim()} type="button">
                {saving ? "添加中..." : "确认添加"}
              </button>
            </div>
          </div>
        )}

        <div style={{ marginBottom: "14px" }}>
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="搜索供应商..." />
        </div>
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <DataTable columns={columns} data={data} loading={loading} total={total} page={page} onPageChange={setPage} emptyTitle="暂无供应商" emptyDesc="还没有添加任何供应商" />
        )}
      </div>
    </div>
  );
}
