"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { useToast } from "../../lib/toast-context";
import { StatusBadge } from "../../components/StatusBadge";
import type { Payment, PaginatedList } from "shared";

const methodLabels: Record<string, string> = {
  cash: "现金", bank_transfer: "银行转账", alipay: "支付宝",
  wechat: "微信支付", credit_card: "信用卡", other: "其他",
};

export default function PaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  const enterpriseId = user?.enterpriseId ?? workspace.enterprises[0]?.id;
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enterpriseId) return;
    fetchJson<PaginatedList<Payment>>(`/payments?enterpriseId=${enterpriseId}&limit=1000`, { adminUserId: user?.id })
      .then((res) => {
        const found = res.items.find((p) => p.id === id);
        if (!found) throw new Error("not found");
        setPayment(found);
      })
      .catch(() => showToast("加载付款信息失败", "error"))
      .finally(() => setLoading(false));
  }, [id, enterpriseId, user?.id, showToast]);

  if (loading) {
    return (
      <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
        <div className="page-shell"><div className="loading"><div className="spinner" /></div></div>
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
        <div className="page-shell">
          <p style={{ color: "var(--c-8c8c8c)", textAlign: "center", padding: 48 }}>付款不存在</p>
          <div style={{ textAlign: "center" }}>
            <button className="page-secondary-button" onClick={() => router.push("/payments")}>返回列表</button>
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
            <button className="chat-back" onClick={() => router.push("/payments")} type="button">←</button>
            <h1>付款详情</h1>
          </div>
        </div>

        <div className="settings-list">
          <div className="settings-card">
            <div><strong>编号</strong></div>
            <span className="settings-meta" style={{ fontFamily: "monospace", fontSize: 12 }}>{payment.id}</span>
          </div>
          <div className="settings-card">
            <div><strong>金额</strong></div>
            <span className="settings-meta" style={{ fontSize: 16, fontWeight: 700 }}>¥{payment.amount.toFixed(2)}</span>
          </div>
          <div className="settings-card">
            <div><strong>支付方式</strong></div>
            <span className="settings-meta">{methodLabels[payment.method] ?? payment.method}</span>
          </div>
          <div className="settings-card">
            <div><strong>状态</strong></div>
            <StatusBadge status={payment.status} />
          </div>
          {payment.orderId && (
            <div className="settings-card">
              <div><strong>关联订单</strong></div>
              <Link href={`/orders/${payment.orderId}`} style={{ color: "var(--c-4a90e6)", fontSize: 13 }}>
                查看订单 →
              </Link>
            </div>
          )}
          <div className="settings-card">
            <div><strong>收款时间</strong></div>
            <span className="settings-meta">{payment.receivedAt?.slice(0, 10) ?? "未记录"}</span>
          </div>
          <div className="settings-card">
            <div><strong>创建时间</strong></div>
            <span className="settings-meta">{payment.createdAt}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
