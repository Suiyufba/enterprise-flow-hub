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
import { TagInput, TagList } from "../components/TagInput";
import { EnterpriseBadge, EnterpriseScopeSelect, ProjectBadge, ProjectScopeSelect } from "../components/ProjectScopeSelect";
import type { Supplier, PaginatedList } from "shared";

export default function SuppliersPage() {
  const { user } = useAuth();
  const { workspace, refresh } = useWorkspace();
  const { showToast } = useToast();
  const [enterpriseFilter, setEnterpriseFilter] = useState("");
  const enterprises = user?.role === "admin" ? workspace.enterprises : workspace.enterprises.filter((enterprise) => enterprise.id === user?.enterpriseId);
  const enterpriseId = enterpriseFilter || user?.enterpriseId || enterprises[0]?.id;
  const projects = workspace.projects.filter((project) => project.enterpriseId === enterpriseId);
  const [data, setData] = useState<Supplier[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [editForm, setEditForm] = useState({ enterpriseId: "", projectId: "", name: "", contact: "", phone: "", email: "", address: "", tags: [] as string[] });
  const [editSaving, setEditSaving] = useState(false);
  useEffect(() => { if (!enterpriseFilter && user?.enterpriseId) setEnterpriseFilter(user.enterpriseId); }, [enterpriseFilter, user?.enterpriseId]);
  const load = useCallback(async () => {
    if (!enterpriseId) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ enterpriseId, page: String(page), limit: "20" });
      if (search) params.set("search", search);
      if (projectFilter) params.set("projectId", projectFilter);
      const res = await fetchJson<PaginatedList<Supplier>>(`/suppliers?${params}`, { adminUserId: user?.id });
      setData(res.items);
      setTotal(res.total);
    } catch {
      setError("加载失败，请检查网络后重试");
      showToast("加载失败", "error");
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, page, projectFilter, search, showToast, user?.id]);

  useEffect(() => { load(); }, [load]);

  function startEdit(supplier: Supplier) {
    setEditingSupplier(supplier);
    setEditForm({ enterpriseId: supplier.enterpriseId, projectId: supplier.projectId, name: supplier.name, contact: supplier.contact, phone: supplier.phone, email: supplier.email, address: supplier.address, tags: supplier.tags });
  }

  async function saveSupplier() {
    if (!editingSupplier || !editForm.enterpriseId || !editForm.projectId || !editForm.name.trim()) return;
    setEditSaving(true);
    try {
      await fetchJson(`/suppliers/${editingSupplier.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          enterpriseId: editForm.enterpriseId,
          projectId: editForm.projectId,
          name: editForm.name.trim(), contact: editForm.contact.trim(), phone: editForm.phone.trim(),
          email: editForm.email.trim(), address: editForm.address.trim(), tags: editForm.tags,
        }),
        adminUserId: user?.id,
      });
      setEditingSupplier(null);
      showToast("供应商信息已更新", "success");
      await load();
    } catch { showToast("供应商信息保存失败", "error"); }
    finally { setEditSaving(false); }
  }

  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function createSupplier() {
    if (!name.trim() || !enterpriseId || !projectId) return;
    setSaving(true);
    try {
      await fetchJson("/suppliers", {
        method: "POST",
        body: JSON.stringify({
          enterpriseId,
          projectId,
          name: name.trim(),
          contact: contact.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          address: address.trim() || undefined,
          tags,
        }),
        adminUserId: user?.id,
      });
      setName(""); setProjectId(""); setContact(""); setPhone(""); setEmail(""); setAddress(""); setTags([]);
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
    { key: "enterpriseId", label: "所属企业", render: (s: Supplier) => <EnterpriseBadge enterprises={workspace.enterprises} enterpriseId={s.enterpriseId} /> },
    { key: "projectId", label: "业务子类", render: (s: Supplier) => <ProjectBadge projects={workspace.projects} projectId={s.projectId} /> },
    { key: "phone", label: "电话" },
    { key: "tags", label: "标签", render: (s: Supplier) => <TagList tags={s.tags.slice(0, 3)} emptyText="-" /> },
    {
      key: "actions",
      label: "操作",
      width: "150px",
      render: (s: Supplier) => <TableRowActions viewHref={`/suppliers/${s.id}`} onEdit={() => startEdit(s)} />,
    },
  ];

  return (
    <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
      <div className="page-shell">
        <PageHeader
          title="供应商管理"
          description="管理所有供应商信息"
          actions={
            <button className="page-primary-button" onClick={() => setShowForm(!showForm)} type="button" style={{ border: 0, borderRadius: "10px", fontSize: "14px", fontWeight: 700, cursor: "pointer", padding: "10px 18px", background: "var(--c-f0f0f0)", color: "var(--c-181818)" }}>
              {showForm ? <><AppIcon name="x" /> 取消</> : <><AppIcon name="plus" /> 新建供应商</>}
            </button>
          }
        />

        {showForm && (
          <div className="settings-card" style={{ marginBottom: 14, borderColor: "var(--c-4a90e6)" }}>
            <div className="settings-edit-form">
              <label htmlFor="new-supplier-enterprise">所属企业 *</label>
              <EnterpriseScopeSelect id="new-supplier-enterprise" enterprises={enterprises} value={enterpriseId ?? ""} onChange={(value) => { setEnterpriseFilter(value); setProjectId(""); }} className="page-input" ariaLabel="供应商所属企业" />
              <label htmlFor="new-supplier-project">业务子类 *</label>
              <ProjectScopeSelect id="new-supplier-project" projects={projects} value={projectId} onChange={setProjectId} includeAll={false} className="page-input" ariaLabel="供应商业务子类" />
              <label htmlFor="new-supplier-name">名称 *</label>
              <input id="new-supplier-name" className="page-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="供应商名称 *" />
              <label htmlFor="new-supplier-contact">联系人</label>
              <input id="new-supplier-contact" className="page-input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="联系人" />
              <label htmlFor="new-supplier-phone">电话</label>
              <input id="new-supplier-phone" className="page-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="电话" />
              <label htmlFor="new-supplier-email">邮箱</label>
              <input id="new-supplier-email" className="page-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="邮箱" />
              <label htmlFor="new-supplier-address">地址</label>
              <input id="new-supplier-address" className="page-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="地址" />
              <label>自定义标签</label>
              <TagInput tags={tags} onChange={setTags} />
              <button className="page-primary-button" onClick={createSupplier} disabled={saving || !name.trim() || !enterpriseId || !projectId} type="button">
                {saving ? "添加中..." : "确认添加"}
              </button>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: "10px", marginBottom: "14px" }}>
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="搜索名称、联系人、电话或标签..." />
          <EnterpriseScopeSelect enterprises={enterprises} value={enterpriseId ?? ""} onChange={(value) => { setEnterpriseFilter(value); setProjectFilter(""); setPage(1); }} ariaLabel="按所属企业筛选" />
          <ProjectScopeSelect projects={projects} value={projectFilter} onChange={(value) => { setProjectFilter(value); setPage(1); }} />
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
            emptyTitle="暂无供应商"
            emptyDesc="还没有添加任何供应商"
            emptyAction={<button className="page-primary-button" onClick={() => setShowForm(true)} type="button">新建供应商</button>}
          />
        )}
        <FormDialog open={Boolean(editingSupplier)} title={`编辑供应商${editingSupplier ? `：${editingSupplier.name}` : ""}`} saving={editSaving} submitDisabled={!editForm.enterpriseId || !editForm.projectId || !editForm.name.trim()} onSubmit={saveSupplier} onCancel={() => setEditingSupplier(null)}>
          <label className="form-label" htmlFor="edit-supplier-enterprise">所属企业 *</label>
          <EnterpriseScopeSelect id="edit-supplier-enterprise" enterprises={enterprises} value={editForm.enterpriseId} onChange={(enterpriseId) => setEditForm((current) => ({ ...current, enterpriseId, projectId: "" }))} className="page-input" ariaLabel="供应商所属企业" />
          <label className="form-label" htmlFor="edit-supplier-project">业务子类 *</label>
          <ProjectScopeSelect id="edit-supplier-project" projects={workspace.projects.filter((project) => project.enterpriseId === editForm.enterpriseId)} value={editForm.projectId} onChange={(projectId) => setEditForm((current) => ({ ...current, projectId }))} includeAll={false} className="page-input" ariaLabel="供应商业务子类" />
          <label className="form-label" htmlFor="edit-supplier-name">供应商名称 *</label>
          <input id="edit-supplier-name" className="page-input" autoFocus value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} />
          <label className="form-label" htmlFor="edit-supplier-contact">联系人</label>
          <input id="edit-supplier-contact" className="page-input" value={editForm.contact} onChange={(event) => setEditForm((current) => ({ ...current, contact: event.target.value }))} />
          <label className="form-label" htmlFor="edit-supplier-phone">电话</label>
          <input id="edit-supplier-phone" className="page-input" value={editForm.phone} onChange={(event) => setEditForm((current) => ({ ...current, phone: event.target.value }))} />
          <label className="form-label" htmlFor="edit-supplier-email">邮箱</label>
          <input id="edit-supplier-email" className="page-input" type="email" value={editForm.email} onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))} />
          <label className="form-label" htmlFor="edit-supplier-address">地址</label>
          <input id="edit-supplier-address" className="page-input" value={editForm.address} onChange={(event) => setEditForm((current) => ({ ...current, address: event.target.value }))} />
          <label className="form-label">自定义标签</label>
          <TagInput tags={editForm.tags} onChange={(tags) => setEditForm((current) => ({ ...current, tags }))} />
        </FormDialog>
      </div>
    </div>
  );
}
