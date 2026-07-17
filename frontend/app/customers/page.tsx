"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchJson } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import { useToast } from "../lib/toast-context";
import { PageHeader } from "../components/PageHeader";
import { SearchInput } from "../components/SearchInput";
import { StatusBadge } from "../components/StatusBadge";
import { ErrorState } from "../components/ErrorState";
import { DataTable } from "../components/DataTable";
import { AppIcon } from "../components/AppIcon";
import { TableRowActions } from "../components/TableRowActions";
import { FormDialog } from "../components/FormDialog";
import { TagInput, TagList } from "../components/TagInput";
import { EnterpriseBadge, EnterpriseScopeSelect, ProjectBadge, ProjectScopeSelect } from "../components/ProjectScopeSelect";
import type { Customer, PaginatedList } from "shared";

export default function CustomersPage() {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  const [enterpriseFilter, setEnterpriseFilter] = useState("");
  const availableEnterprises = user?.role === "admin"
    ? workspace.enterprises
    : workspace.enterprises.filter((enterprise) => enterprise.id === user?.enterpriseId);
  const enterpriseId = enterpriseFilter || user?.enterpriseId || availableEnterprises[0]?.id;
  const projects = workspace.projects.filter((project) => project.enterpriseId === enterpriseId);
  const [data, setData] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    enterpriseId: "", projectId: "", name: "", contact: "", phone: "", email: "", address: "", gender: "unknown" as Customer["gender"], tags: [] as string[], status: "active" as Customer["status"],
  });

  useEffect(() => {
    if (!enterpriseFilter && user?.enterpriseId) setEnterpriseFilter(user.enterpriseId);
  }, [enterpriseFilter, user?.enterpriseId]);
  const load = useCallback(async () => {
    if (!enterpriseId) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ enterpriseId, page: String(page), limit: "20" });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (projectFilter) params.set("projectId", projectFilter);
      const res = await fetchJson<PaginatedList<Customer>>(`/customers?${params}`, { adminUserId: user?.id });
      setData(res.items);
      setTotal(res.total);
    } catch {
      setError("加载失败，请检查网络后重试");
      showToast("加载失败", "error");
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, page, projectFilter, search, statusFilter, showToast, user?.id]);

  useEffect(() => { load(); }, [load]);

  function startEdit(customer: Customer) {
    setEditingCustomer(customer);
    setEditForm({
      enterpriseId: customer.enterpriseId,
      projectId: customer.projectId,
      name: customer.name,
      contact: customer.contact,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      gender: customer.gender,
      tags: customer.tags,
      status: customer.status,
    });
  }

  async function saveCustomer() {
    if (!editingCustomer || !editForm.enterpriseId || !editForm.projectId || !editForm.name.trim()) return;
    setSaving(true);
    try {
      await fetchJson(`/customers/${editingCustomer.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          enterpriseId: editForm.enterpriseId,
          projectId: editForm.projectId,
          name: editForm.name.trim(),
          contact: editForm.contact.trim(),
          phone: editForm.phone.trim(),
          email: editForm.email.trim(),
          address: editForm.address.trim(),
          gender: editForm.gender,
          tags: editForm.tags,
          status: editForm.status,
        }),
        adminUserId: user?.id,
      });
      setEditingCustomer(null);
      showToast("客户信息已更新", "success");
      await load();
    } catch {
      showToast("客户信息保存失败", "error");
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    {
      key: "name",
      label: "名称",
      render: (c: Customer) => (
        <Link href={`/customers/${c.id}`} style={{ color: "var(--c-f0f0f0)", fontWeight: 600, textDecoration: "none" }}>
          {c.name}
        </Link>
      ),
    },
    { key: "contact", label: "联系人" },
    { key: "enterpriseId", label: "所属企业", render: (c: Customer) => <EnterpriseBadge enterprises={workspace.enterprises} enterpriseId={c.enterpriseId} /> },
    { key: "projectId", label: "业务子类", render: (c: Customer) => <ProjectBadge projects={workspace.projects} projectId={c.projectId} /> },
    { key: "phone", label: "电话" },
    { key: "tags", label: "标签", render: (c: Customer) => <TagList tags={c.tags.slice(0, 3)} emptyText="-" /> },
    { key: "status", label: "状态", render: (c: Customer) => <StatusBadge status={c.status} /> },
    {
      key: "actions",
      label: "操作",
      width: "150px",
      render: (c: Customer) => <TableRowActions viewHref={`/customers/${c.id}`} onEdit={() => startEdit(c)} />,
    },
  ];

  return (
    <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
      <div className="page-shell">
        <PageHeader
          title="客户管理"
          description="管理所有客户和潜在客户信息"
          actions={<Link href="/customers/new" className="page-primary-button"><AppIcon name="plus" /> 新建客户</Link>}
        />
        <div className="page-toolbar" style={{ display: "flex", gap: "10px", marginBottom: "14px" }}>
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="搜索名称、联系人、电话或标签..." />
          <EnterpriseScopeSelect enterprises={availableEnterprises} value={enterpriseId ?? ""} onChange={(value) => { setEnterpriseFilter(value); setProjectFilter(""); setPage(1); }} includeAll={false} ariaLabel="按所属企业筛选" />
          <ProjectScopeSelect projects={projects} value={projectFilter} onChange={(value) => { setProjectFilter(value); setPage(1); }} />
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="search-enterprise-select">
            <option value="">全部状态</option>
            <option value="active">活跃</option>
            <option value="inactive">非活跃</option>
            <option value="lead">潜在</option>
            <option value="lost">已流失</option>
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
            emptyTitle="暂无客户"
            emptyDesc="还没有添加任何客户"
            emptyAction={<Link href="/customers/new" className="page-primary-button" style={{ textDecoration: "none" }}>新建客户</Link>}
          />
        )}
        <FormDialog
          open={Boolean(editingCustomer)}
          title={`编辑客户${editingCustomer ? `：${editingCustomer.name}` : ""}`}
          saving={saving}
          submitDisabled={!editForm.enterpriseId || !editForm.projectId || !editForm.name.trim()}
          onSubmit={saveCustomer}
          onCancel={() => setEditingCustomer(null)}
        >
          <label className="form-label" htmlFor="edit-customer-enterprise">所属企业 *</label>
          <EnterpriseScopeSelect id="edit-customer-enterprise" enterprises={availableEnterprises} value={editForm.enterpriseId} onChange={(enterpriseId) => setEditForm((current) => ({ ...current, enterpriseId, projectId: "" }))} className="page-input" ariaLabel="客户所属企业" />
          <label className="form-label" htmlFor="edit-customer-project">业务子类 *</label>
          <ProjectScopeSelect id="edit-customer-project" projects={workspace.projects.filter((project) => project.enterpriseId === editForm.enterpriseId)} value={editForm.projectId} onChange={(projectId) => setEditForm((current) => ({ ...current, projectId }))} includeAll={false} className="page-input" ariaLabel="客户业务子类" />
          <label className="form-label" htmlFor="edit-customer-name">客户名称 *</label>
          <input id="edit-customer-name" className="page-input" autoFocus value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} />
          <label className="form-label" htmlFor="edit-customer-contact">联系人</label>
          <input id="edit-customer-contact" className="page-input" value={editForm.contact} onChange={(event) => setEditForm((current) => ({ ...current, contact: event.target.value }))} />
          <label className="form-label" htmlFor="edit-customer-phone">电话</label>
          <input id="edit-customer-phone" className="page-input" value={editForm.phone} onChange={(event) => setEditForm((current) => ({ ...current, phone: event.target.value }))} />
          <label className="form-label" htmlFor="edit-customer-email">邮箱</label>
          <input id="edit-customer-email" className="page-input" type="email" value={editForm.email} onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))} />
          <label className="form-label" htmlFor="edit-customer-address">地址</label>
          <input id="edit-customer-address" className="page-input" value={editForm.address} onChange={(event) => setEditForm((current) => ({ ...current, address: event.target.value }))} />
          <label className="form-label" htmlFor="edit-customer-gender">性别</label>
          <select id="edit-customer-gender" className="page-input" value={editForm.gender} onChange={(event) => setEditForm((current) => ({ ...current, gender: event.target.value as Customer["gender"] }))}>
            <option value="unknown">未设置</option><option value="male">男</option><option value="female">女</option><option value="other">其他</option>
          </select>
          <label className="form-label">自定义标签</label>
          <TagInput tags={editForm.tags} onChange={(tags) => setEditForm((current) => ({ ...current, tags }))} />
          <label className="form-label" htmlFor="edit-customer-status">状态</label>
          <select id="edit-customer-status" className="page-input" value={editForm.status} onChange={(event) => setEditForm((current) => ({ ...current, status: event.target.value as Customer["status"] }))}>
            <option value="active">活跃</option>
            <option value="inactive">非活跃</option>
            <option value="lead">潜在</option>
            <option value="lost">已流失</option>
          </select>
        </FormDialog>
      </div>
    </div>
  );
}
