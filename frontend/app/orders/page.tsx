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
import { EnterpriseBadge, EnterpriseScopeSelect, ProjectBadge, ProjectScopeSelect } from "../components/ProjectScopeSelect";
import type { Order, PaginatedList } from "shared";

export default function OrdersPage() {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  const [enterpriseFilter, setEnterpriseFilter] = useState("");
  const enterprises = user?.role === "admin" ? workspace.enterprises : workspace.enterprises.filter((enterprise) => enterprise.id === user?.enterpriseId);
  const enterpriseId = enterpriseFilter || user?.enterpriseId || enterprises[0]?.id;
  const projects = workspace.projects.filter((project) => project.enterpriseId === enterpriseId);
  const [data, setData] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { if (!enterpriseFilter && user?.enterpriseId) setEnterpriseFilter(user.enterpriseId); }, [enterpriseFilter, user?.enterpriseId]);
  const load = useCallback(async () => {
    if (!enterpriseId) {
      setData([]);
      setTotal(0);
      setError("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ enterpriseId, page: String(page), limit: "20" });
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("search", search);
      if (projectFilter) params.set("projectId", projectFilter);
      const res = await fetchJson<PaginatedList<Order>>(`/orders?${params}`, { adminUserId: user?.id });
      setData(res.items);
      setTotal(res.total);
    } catch { showToast("加载失败", "error"); setError("加载失败，请检查网络后重试"); }
    finally { setLoading(false); }
  }, [enterpriseId, page, projectFilter, statusFilter, search, showToast, user?.id]);

  useEffect(() => { load(); }, [load]);

  const columns = [
    {
      key: "id",
      label: "订单号",
      render: (o: Order) => (
        <Link href={`/orders/${o.id}`} style={{ fontFamily: "monospace", fontSize: "12px", color: "var(--c-f0f0f0)", textDecoration: "none", fontWeight: 600 }}>
          {o.id.slice(0, 12)}
        </Link>
      ),
    },
    { key: "enterpriseId", label: "所属企业", render: (o: Order) => <EnterpriseBadge enterprises={workspace.enterprises} enterpriseId={o.enterpriseId} /> },
    { key: "projectId", label: "业务子类", render: (o: Order) => <ProjectBadge projects={workspace.projects} projectId={o.projectId} /> },
    { key: "totalAmount", label: "金额", render: (o: Order) => `¥${o.totalAmount.toFixed(2)}` },
    { key: "status", label: "状态", render: (o: Order) => <StatusBadge status={o.status} /> },
    { key: "createdAt", label: "创建时间", render: (o: Order) => o.createdAt?.slice(0, 10) },
    {
      key: "actions",
      label: "操作",
      width: "150px",
      render: (o: Order) => <TableRowActions viewHref={`/orders/${o.id}`} editHref={o.status === "draft" ? `/orders/${o.id}?edit=1` : undefined} />,
    },
  ];

  return (
    <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
      <div className="page-shell">
        <PageHeader title="订单管理" description="管理所有订单、付款和发票"
          actions={
            <Link href="/orders/new" className="page-primary-button">
              <AppIcon name="plus" /> 新建订单
            </Link>
          }
        />
        <div className="page-toolbar" style={{ display: "flex", gap: "10px", marginBottom: "14px" }}>
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="搜索订单号..." />
          <EnterpriseScopeSelect enterprises={enterprises} value={enterpriseId ?? ""} onChange={(value) => { setEnterpriseFilter(value); setProjectFilter(""); setPage(1); }} ariaLabel="按所属企业筛选" />
          <ProjectScopeSelect projects={projects} value={projectFilter} onChange={(value) => { setProjectFilter(value); setPage(1); }} />
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="search-enterprise-select">
            <option value="">全部状态</option>
            <option value="draft">草稿</option>
            <option value="confirmed">已确认</option>
            <option value="processing">处理中</option>
            <option value="shipped">已发货</option>
            <option value="delivered">已交付</option>
            <option value="cancelled">已取消</option>
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
            emptyTitle="暂无订单"
            emptyDesc="还没有任何订单"
            emptyAction={<Link href="/orders/new" className="page-primary-button" style={{ textDecoration: "none" }}>新建订单</Link>}
          />
        )}
      </div>
    </div>
  );
}
