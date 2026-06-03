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
import type { Payment, PaginatedList } from "shared";

const methodLabels: Record<string, string> = {
  cash: "现金", bank_transfer: "银行转账", alipay: "支付宝",
  wechat: "微信支付", credit_card: "信用卡", other: "其他",
};

export default function PaymentsPage() {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  const enterpriseId = user?.enterpriseId ?? workspace.enterprises[0]?.id;
  const [data, setData] = useState<Payment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const load = useCallback(async () => {
    if (!enterpriseId) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ enterpriseId, page: String(page), limit: "20" });
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("orderId", search);
      const res = await fetchJson<PaginatedList<Payment>>(`/payments?${params}`, { adminUserId: user?.id });
      setData(res.items);
      setTotal(res.total);
    } catch { showToast("加载失败", "error"); setError("加载失败，请检查网络后重试"); }
    finally { setLoading(false); }
  }, [enterpriseId, page, statusFilter, search, showToast, user?.id]);

  useEffect(() => { load(); }, [load]);

  const [method, setMethod] = useState("bank_transfer");
  const [amount, setAmount] = useState("");
  const [orderId, setOrderId] = useState("");
  const [saving, setSaving] = useState(false);

  async function createPayment() {
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0 || !enterpriseId) return;
    setSaving(true);
    try {
      await fetchJson("/payments", {
        method: "POST",
        body: JSON.stringify({
          enterpriseId,
          orderId: orderId.trim() || undefined,
          amount: parseFloat(amount),
          method,
        }),
        adminUserId: user?.id,
      });
      setAmount(""); setOrderId(""); setMethod("bank_transfer");
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
  ];

  return (
    <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
      <div className="page-shell">
        <PageHeader
          title="付款管理"
          description="管理所有收款与付款记录"
          actions={
            <button className="page-primary-button" onClick={() => setShowForm(!showForm)} type="button" style={{ border: 0, borderRadius: "10px", fontSize: "14px", fontWeight: 700, cursor: "pointer", padding: "10px 18px", background: "var(--c-f0f0f0)", color: "var(--c-181818)" }}>
              {showForm ? "取消" : "+ 新建付款"}
            </button>
          }
        />

        {showForm && (
          <div className="settings-card" style={{ marginBottom: 14, borderColor: "var(--c-4a90e6)" }}>
            <div className="settings-edit-form">
              <label className="form-label" htmlFor="payment-method">支付方式</label>
              <select id="payment-method" className="page-input" value={method} onChange={(e) => setMethod(e.target.value)}>
                {Object.entries(methodLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <label className="form-label" htmlFor="payment-amount">金额 *</label>
              <input id="payment-amount" className="page-input" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="金额 *" />
              <label className="form-label" htmlFor="payment-orderid">关联订单 ID（可选）</label>
              <input id="payment-orderid" className="page-input" value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="关联订单 ID（可选）" />
              <button className="page-primary-button" onClick={createPayment} disabled={saving || !amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0} type="button">
                {saving ? "创建中..." : "确认创建"}
              </button>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: "10px", marginBottom: "14px" }}>
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="搜索关联订单..." />
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
