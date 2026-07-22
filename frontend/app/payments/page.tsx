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
import type { Order, Payment, PaginatedList } from "shared";

const methodLabels: Record<string, string> = {
  cash: "现金", bank_transfer: "银行转账", alipay: "支付宝",
  wechat: "微信支付", credit_card: "信用卡", other: "其他",
};

export default function PaymentsPage() {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  const [enterpriseFilter, setEnterpriseFilter] = useState("");
  const enterprises = user?.role === "admin" ? workspace.enterprises : workspace.enterprises.filter((enterprise) => enterprise.id === user?.enterpriseId);
  const enterpriseId = enterpriseFilter || user?.enterpriseId || enterprises[0]?.id;
  const projects = workspace.projects.filter((project) => project.enterpriseId === enterpriseId);
  const [data, setData] = useState<Payment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
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
      if (search) params.set("orderId", search);
      if (projectFilter) params.set("projectId", projectFilter);
      const res = await fetchJson<PaginatedList<Payment>>(`/payments?${params}`, { adminUserId: user?.id });
      setData(res.items);
      setTotal(res.total);
    } catch { showToast("加载失败", "error"); setError("加载失败，请检查网络后重试"); }
    finally { setLoading(false); }
  }, [enterpriseId, page, projectFilter, statusFilter, search, showToast, user?.id]);

  useEffect(() => { load(); }, [load]);

  const [method, setMethod] = useState("bank_transfer");
  const [projectId, setProjectId] = useState("");
  const [amount, setAmount] = useState("");
  const [orderId, setOrderId] = useState("");
  const [orderOptions, setOrderOptions] = useState<Order[]>([]);
  const [orderOptionsTotal, setOrderOptionsTotal] = useState(0);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderOptionsLoading, setOrderOptionsLoading] = useState(false);
  const [orderOptionsError, setOrderOptionsError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!showForm || !enterpriseId || !projectId) {
      setOrderOptions([]);
      setOrderOptionsTotal(0);
      setOrderOptionsError("");
      setOrderOptionsLoading(false);
      return;
    }

    let cancelled = false;
    setOrderOptionsLoading(true);
    setOrderOptionsError("");
    const params = new URLSearchParams({
      enterpriseId,
      projectId,
      page: "1",
      limit: "200",
    });
    if (orderSearch.trim()) params.set("search", orderSearch.trim());
    const timer = window.setTimeout(() => fetchJson<PaginatedList<Order>>(`/orders?${params}`, { adminUserId: user?.id })
      .then((response) => {
        if (!cancelled) {
          setOrderOptions(response.items);
          setOrderOptionsTotal(response.total);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOrderOptions([]);
          setOrderOptionsTotal(0);
          setOrderOptionsError("订单选项加载失败，可稍后重试");
        }
      })
      .finally(() => {
        if (!cancelled) setOrderOptionsLoading(false);
      }), 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enterpriseId, orderSearch, projectId, showForm, user?.id]);

  async function createPayment() {
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0 || !enterpriseId || !projectId) return;
    setSaving(true);
    try {
      await fetchJson("/payments", {
        method: "POST",
        body: JSON.stringify({
          enterpriseId,
          projectId,
          orderId: orderId.trim() || undefined,
          amount: parseFloat(amount),
          method,
        }),
        adminUserId: user?.id,
      });
      setAmount(""); setOrderId(""); setMethod("bank_transfer"); setProjectId("");
      setShowForm(false);
      showToast("付款已创建", "success");
      await load();
    } catch { showToast("创建失败", "error"); }
    finally { setSaving(false); }
  }

  const columns = [
    {
      key: "id",
      label: "编号",
      render: (p: Payment) => (
        <Link href={`/payments/${p.id}`} style={{ fontFamily: "monospace", fontSize: "12px", color: "var(--c-f0f0f0)", textDecoration: "none", fontWeight: 600 }}>
          {p.id.slice(0, 12)}
        </Link>
      ),
    },
    { key: "enterpriseId", label: "所属企业", render: (p: Payment) => <EnterpriseBadge enterprises={workspace.enterprises} enterpriseId={p.enterpriseId} /> },
    { key: "projectId", label: "业务子类", render: (p: Payment) => <ProjectBadge projects={workspace.projects} projectId={p.projectId} /> },
    { key: "amount", label: "金额", render: (p: Payment) => `¥${p.amount.toFixed(2)}` },
    { key: "method", label: "支付方式", render: (p: Payment) => methodLabels[p.method] ?? p.method },
    { key: "status", label: "状态", render: (p: Payment) => <StatusBadge status={p.status} /> },
    {
      key: "orderId",
      label: "关联订单",
      render: (p: Payment) =>
        p.orderId ? (
          <Link href={`/orders/${p.orderId}`} style={{ fontFamily: "monospace", fontSize: 11, color: "var(--c-4a90e6)", textDecoration: "none" }}>
            {p.orderId.slice(0, 12)}
          </Link>
        ) : <span style={{ color: "var(--c-8c8c8c)", fontSize: 12 }}>-</span>,
    },
    { key: "receivedAt", label: "收款时间", render: (p: Payment) => p.receivedAt?.slice(0, 10) ?? "-" },
    {
      key: "actions",
      label: "操作",
      width: "150px",
      render: (p: Payment) => <TableRowActions viewHref={`/payments/${p.id}`} editHref={p.status === "pending" ? `/payments/${p.id}?edit=1` : undefined} />,
    },
  ];

  return (
    <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
      <div className="page-shell">
        <PageHeader
          title="付款管理"
          description="管理所有收款与付款记录"
          actions={
            <button className="page-primary-button" onClick={() => setShowForm(!showForm)} type="button">
              {showForm ? <><AppIcon name="x" /> 取消</> : <><AppIcon name="plus" /> 新建付款</>}
            </button>
          }
        />

        {showForm && (
          <div className="settings-card" style={{ marginBottom: 14, borderColor: "var(--c-4a90e6)" }}>
            <div className="settings-edit-form">
              <label className="form-label" htmlFor="payment-enterprise">所属企业 *</label>
              <EnterpriseScopeSelect id="payment-enterprise" enterprises={enterprises} value={enterpriseId ?? ""} onChange={(value) => { setEnterpriseFilter(value); setProjectId(""); setOrderId(""); setOrderSearch(""); }} className="page-input" ariaLabel="付款所属企业" />
              <label className="form-label" htmlFor="payment-project">业务子类 *</label>
              <ProjectScopeSelect id="payment-project" projects={projects} value={projectId} onChange={(value) => { setProjectId(value); setOrderId(""); setOrderSearch(""); }} includeAll={false} className="page-input" ariaLabel="付款业务子类" />
              <label className="form-label" htmlFor="payment-method">支付方式</label>
              <select id="payment-method" className="page-input" value={method} onChange={(e) => setMethod(e.target.value)}>
                {Object.entries(methodLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <label className="form-label" htmlFor="payment-amount">金额 *</label>
              <input id="payment-amount" className="page-input" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="金额 *" />
              <label className="form-label" htmlFor="payment-orderid">关联订单（可选）</label>
              <input
                className="page-input"
                value={orderSearch}
                onChange={(event) => setOrderSearch(event.target.value)}
                placeholder="按订单号、客户名或备注搜索"
                aria-label="搜索关联订单"
                disabled={!projectId}
              />
              <select
                id="payment-orderid"
                className="page-input"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                disabled={!projectId || orderOptionsLoading}
              >
                <option value="">
                  {!projectId ? "请先选择业务子类" : orderOptionsLoading ? "正在加载订单..." : "不关联订单"}
                </option>
                {orderOptions.map((order) => (
                  <option key={order.id} value={order.id}>
                    {`订单 ${order.id.slice(0, 12)} · ¥${order.totalAmount.toFixed(2)} · ${order.status}`}
                  </option>
                ))}
              </select>
              {orderOptionsTotal > orderOptions.length && (
                <p className="form-hint">共 {orderOptionsTotal} 条匹配订单，请输入更精确的关键词继续查找</p>
              )}
              {orderOptionsError && <p className="form-hint form-hint-error" role="alert">{orderOptionsError}</p>}
              <button className="page-primary-button" onClick={createPayment} disabled={saving || !enterpriseId || !projectId || !amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0} type="button">
                {saving ? "创建中..." : "确认创建"}
              </button>
            </div>
          </div>
        )}

        <div className="page-toolbar" style={{ display: "flex", gap: "10px", marginBottom: "14px" }}>
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="搜索关联订单..." />
          <EnterpriseScopeSelect enterprises={enterprises} value={enterpriseId ?? ""} onChange={(value) => { setEnterpriseFilter(value); setProjectFilter(""); setPage(1); }} ariaLabel="按所属企业筛选" />
          <ProjectScopeSelect projects={projects} value={projectFilter} onChange={(value) => { setProjectFilter(value); setPage(1); }} />
          <select className="search-enterprise-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">全部状态</option>
            <option value="pending">待处理</option>
            <option value="completed">已完成</option>
            <option value="failed">失败</option>
            <option value="refunded">已退款</option>
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
            emptyTitle="暂无付款"
            emptyDesc="还没有任何付款记录"
            emptyAction={<button className="page-primary-button" onClick={() => setShowForm(true)} type="button">新建付款</button>}
          />
        )}
      </div>
    </div>
  );
}
