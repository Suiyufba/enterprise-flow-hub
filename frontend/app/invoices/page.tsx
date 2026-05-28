"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fetchJson } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import { useToast } from "../lib/toast-context";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { DataTable } from "../components/DataTable";
import { gsap, useGSAP } from "../lib/gsap";
import type { Invoice, PaginatedList } from "shared";

const statusLabels: Record<string, string> = {
  draft: "草稿", issued: "已开具", paid: "已付款", overdue: "已逾期", cancelled: "已取消",
};

export default function InvoicesPage() {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  const enterpriseId = user?.enterpriseId ?? workspace.enterprises[0]?.id;
  const [data, setData] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap.from(pageRef.current, { y: 24, autoAlpha: 0, duration: 0.5, ease: "power3.out" });
  }, { scope: pageRef });

  const load = useCallback(async () => {
    if (!enterpriseId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ enterpriseId, page: String(page), limit: "20" });
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetchJson<PaginatedList<Invoice>>(`/invoices?${params}`, { adminUserId: user?.id });
      setData(res.items);
      setTotal(res.total);
    } catch { showToast("加载失败", "error"); }
    finally { setLoading(false); }
  }, [enterpriseId, page, statusFilter, showToast, user?.id]);

  useEffect(() => { load(); }, [load]);

  const [amount, setAmount] = useState("");
  const [orderId, setOrderId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  async function createInvoice() {
    if (!amount || !enterpriseId) return;
    setSaving(true);
    try {
      await fetchJson("/invoices", {
        method: "POST",
        body: JSON.stringify({
          enterpriseId,
          orderId: orderId.trim() || undefined,
          customerId: customerId.trim() || undefined,
          amount: parseFloat(amount),
          dueDate: dueDate || undefined,
        }),
        adminUserId: user?.id,
      });
      setAmount(""); setOrderId(""); setCustomerId(""); setDueDate("");
      setShowForm(false);
      showToast("发票已创建", "success");
      await load();
    } catch { showToast("创建失败", "error"); }
    finally { setSaving(false); }
  }

  const columns = [
    {
      key: "id",
      label: "编号",
      render: (inv: Invoice) => (
        <Link href={`/invoices/${inv.id}`} style={{ fontFamily: "monospace", fontSize: "12px", color: "var(--c-f0f0f0)", textDecoration: "none", fontWeight: 600 }}>
          {inv.id.slice(0, 12)}
        </Link>
      ),
    },
    { key: "amount", label: "金额", render: (inv: Invoice) => `¥${inv.amount.toFixed(2)}` },
    { key: "status", label: "状态", render: (inv: Invoice) => <StatusBadge status={inv.status} /> },
    { key: "dueDate", label: "到期日", render: (inv: Invoice) => inv.dueDate?.slice(0, 10) ?? "-" },
    {
      key: "orderId",
      label: "关联订单",
      render: (inv: Invoice) =>
        inv.orderId ? (
          <Link href={`/orders/${inv.orderId}`} style={{ fontFamily: "monospace", fontSize: 11, color: "var(--c-4a90e6)", textDecoration: "none" }}>
            {inv.orderId.slice(0, 12)}
          </Link>
        ) : <span style={{ color: "var(--c-8c8c8c)", fontSize: 12 }}>-</span>,
    },
    { key: "createdAt", label: "创建时间", render: (inv: Invoice) => inv.createdAt?.slice(0, 10) },
  ];

  return (
    <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
      <div className="page-shell" ref={pageRef}>
        <PageHeader
          title="发票管理"
          description="管理所有发票，跟踪开票和付款状态"
          actions={
            <button className="page-primary-button" onClick={() => setShowForm(!showForm)} type="button" style={{ border: 0, borderRadius: "10px", fontSize: "14px", fontWeight: 700, cursor: "pointer", padding: "10px 18px", background: "var(--c-f0f0f0)", color: "var(--c-181818)" }}>
              {showForm ? "取消" : "+ 新建发票"}
            </button>
          }
        />

        {showForm && (
          <div className="settings-card" style={{ marginBottom: 14, borderColor: "var(--c-4a90e6)" }}>
            <div className="settings-edit-form">
              <input className="page-input" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="金额 *" />
              <input className="page-input" value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="关联订单 ID（可选）" />
              <input className="page-input" value={customerId} onChange={(e) => setCustomerId(e.target.value)} placeholder="关联客户 ID（可选）" />
              <input className="page-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} placeholder="到期日" />
              <button className="page-primary-button" onClick={createInvoice} disabled={saving || !amount} type="button">
                {saving ? "创建中..." : "确认创建"}
              </button>
            </div>
          </div>
        )}

        <div style={{ marginBottom: "14px" }}>
          <select className="search-enterprise-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">全部状态</option>
            <option value="draft">草稿</option>
            <option value="issued">已开具</option>
            <option value="paid">已付款</option>
            <option value="overdue">已逾期</option>
            <option value="cancelled">已取消</option>
          </select>
        </div>

        <DataTable columns={columns} data={data} loading={loading} total={total} page={page} onPageChange={setPage} emptyTitle="暂无发票" emptyDesc="还没有任何发票记录" />
      </div>
    </div>
  );
}
