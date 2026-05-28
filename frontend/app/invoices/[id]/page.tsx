"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { useToast } from "../../lib/toast-context";
import { StatusBadge } from "../../components/StatusBadge";
import type { Invoice, PaginatedList } from "shared";

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  const enterpriseId = user?.enterpriseId ?? workspace.enterprises[0]?.id;
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enterpriseId) return;
    fetchJson<PaginatedList<Invoice>>(`/invoices?enterpriseId=${enterpriseId}&limit=1000`, { adminUserId: user?.id })
      .then((res) => {
        const found = res.items.find((i) => i.id === id);
        if (!found) throw new Error("not found");
        setInvoice(found);
      })
      .catch(() => showToast("加载发票信息失败", "error"))
      .finally(() => setLoading(false));
  }, [id, enterpriseId, user?.id, showToast]);

  if (loading) {
    return (
      <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
        <div className="page-shell"><div className="loading"><div className="spinner" /></div></div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
        <div className="page-shell">
          <p style={{ color: "var(--c-8c8c8c)", textAlign: "center", padding: 48 }}>发票不存在</p>
          <div style={{ textAlign: "center" }}>
            <button className="page-secondary-button" onClick={() => router.push("/invoices")}>返回列表</button>
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
            <button className="chat-back" onClick={() => router.push("/invoices")} type="button">←</button>
            <h1>发票详情</h1>
          </div>
        </div>

        <div className="settings-list">
          <div className="settings-card">
            <div><strong>编号</strong></div>
            <span className="settings-meta" style={{ fontFamily: "monospace", fontSize: 12 }}>{invoice.id}</span>
          </div>
          <div className="settings-card">
            <div><strong>金额</strong></div>
            <span className="settings-meta" style={{ fontSize: 16, fontWeight: 700 }}>¥{invoice.amount.toFixed(2)}</span>
          </div>
          <div className="settings-card">
            <div><strong>状态</strong></div>
            <StatusBadge status={invoice.status} />
          </div>
          <div className="settings-card">
            <div><strong>到期日</strong></div>
            <span className="settings-meta">{invoice.dueDate?.slice(0, 10) ?? "无"}</span>
          </div>
          <div className="settings-card">
            <div><strong>开票日期</strong></div>
            <span className="settings-meta">{invoice.issuedAt?.slice(0, 10) ?? "未开具"}</span>
          </div>
          {invoice.orderId && (
            <div className="settings-card">
              <div><strong>关联订单</strong></div>
              <Link href={`/orders/${invoice.orderId}`} style={{ color: "var(--c-4a90e6)", fontSize: 13 }}>
                查看订单 →
              </Link>
            </div>
          )}
          {invoice.customerId && (
            <div className="settings-card">
              <div><strong>客户</strong></div>
              <Link href={`/customers/${invoice.customerId}`} style={{ color: "var(--c-4a90e6)", fontSize: 13 }}>
                查看客户 →
              </Link>
            </div>
          )}
          <div className="settings-card">
            <div><strong>创建时间</strong></div>
            <span className="settings-meta">{invoice.createdAt}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
