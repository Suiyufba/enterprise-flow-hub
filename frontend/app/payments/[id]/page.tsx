"use client";

import { useEffect, useState, use, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import { useWorkspace } from "../../lib/workspace-context";
import { StatusBadge } from "../../components/StatusBadge";
import { ErrorState } from "../../components/ErrorState";
import { AppIcon } from "../../components/AppIcon";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ProjectBadge, ProjectScopeSelect } from "../../components/ProjectScopeSelect";
import type { Payment } from "shared";

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
  const [payment, setPayment] = useState<Payment | null>(null);
  const projects = workspace.projects.filter((project) => project.enterpriseId === payment?.enterpriseId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusConfirm, setStatusConfirm] = useState<Payment["status"] | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Payment["method"]>("bank_transfer");
  const [orderId, setOrderId] = useState("");
  const [projectId, setProjectId] = useState("");

  const fetchPayment = useCallback(() => {
    setError(null);
    setLoading(true);
    fetchJson<Payment>(`/payments/${id}`, { adminUserId: user?.id })
      .then((found) => {
        setPayment(found);
        setProjectId(found.projectId);
        setAmount(String(found.amount));
        setMethod(found.method);
        setOrderId(found.orderId ?? "");
        if (found.status === "pending" && new URLSearchParams(window.location.search).get("edit") === "1") setEditing(true);
      })
      .catch(() => {
        setError("加载付款详情失败");
        showToast("加载付款信息失败", "error");
      })
      .finally(() => setLoading(false));
  }, [id, user?.id, showToast]);

  useEffect(() => {
    fetchPayment();
  }, [fetchPayment]);

  async function savePayment() {
    if (!payment || payment.status !== "pending") return;
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return;
    setSaving(true);
    try {
      const updated = await fetchJson<Payment>(`/payments/${payment.id}`, {
        method: "PATCH",
        body: JSON.stringify({ projectId, amount: parsedAmount, method, orderId: orderId.trim() || null }),
        adminUserId: user?.id,
      });
      setPayment(updated);
      setEditing(false);
      showToast("付款信息已更新", "success");
    } catch { showToast("付款信息保存失败", "error"); }
    finally { setSaving(false); }
  }

  async function updateStatus() {
    if (!payment || !statusConfirm) return;
    setSaving(true);
    try {
      const updated = await fetchJson<Payment>(`/payments/${payment.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: statusConfirm }),
        adminUserId: user?.id,
      });
      setPayment(updated);
      showToast(statusConfirm === "refunded" ? "退款状态已登记" : "付款状态已更新", "success");
    } catch { showToast("付款状态更新失败", "error"); }
    finally { setSaving(false); setStatusConfirm(null); }
  }

  if (error) {
    return (
      <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
        <div className="page-shell">
          <ErrorState message={error} onRetry={() => { setError(null); fetchPayment(); }} />
        </div>
      </div>
    );
  }

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
            <button className="chat-back" onClick={() => router.push("/payments")} type="button" aria-label="返回付款列表"><AppIcon name="arrow-left" /></button>
            <h1>付款详情</h1>
          </div>
          <div className="page-header-controls">
            {editing ? (
              <>
                <button className="page-secondary-button" onClick={() => { setProjectId(payment.projectId); setEditing(false); }} disabled={saving} type="button">取消</button>
                <button className="page-primary-button" onClick={savePayment} disabled={saving || !Number.isFinite(Number(amount)) || Number(amount) <= 0} type="button">{saving ? "保存中..." : "保存"}</button>
              </>
            ) : (
              <>
                {payment.status === "pending" && <button className="page-secondary-button" onClick={() => setEditing(true)} type="button"><AppIcon name="edit" /> 编辑</button>}
                {payment.status === "pending" && <button className="page-primary-button" onClick={() => setStatusConfirm("completed")} type="button">确认到账</button>}
                {payment.status === "pending" && <button className="page-secondary-button" onClick={() => setStatusConfirm("failed")} type="button">标记失败</button>}
                {payment.status === "completed" && <button className="page-secondary-button" onClick={() => setStatusConfirm("refunded")} type="button">登记退款</button>}
                {payment.status === "failed" && <button className="page-secondary-button" onClick={() => setStatusConfirm("pending")} type="button">重新待处理</button>}
              </>
            )}
          </div>
        </div>

        <div className="settings-list">
          <div className="settings-card">
            <div><strong>所属项目</strong></div>
            {editing ? <ProjectScopeSelect projects={projects} value={projectId} onChange={setProjectId} includeAll={false} className="page-input compact-select" ariaLabel="付款所属项目" /> : <ProjectBadge projects={projects} projectId={payment.projectId} />}
          </div>
          <div className="settings-card">
            <div><strong>编号</strong></div>
            <span className="settings-meta" style={{ fontFamily: "monospace", fontSize: 12 }}>{payment.id}</span>
          </div>
          <div className="settings-card">
            <div><strong>金额</strong></div>
            {editing ? <input className="page-input compact-select" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /> : <span className="settings-meta" style={{ fontSize: 16, fontWeight: 700 }}>¥{payment.amount.toFixed(2)}</span>}
          </div>
          <div className="settings-card">
            <div><strong>支付方式</strong></div>
            {editing ? (
              <select className="page-input compact-select" value={method} onChange={(event) => setMethod(event.target.value as Payment["method"])}>
                {Object.entries(methodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            ) : <span className="settings-meta">{methodLabels[payment.method] ?? payment.method}</span>}
          </div>
          <div className="settings-card">
            <div><strong>状态</strong></div>
            <StatusBadge status={payment.status} />
          </div>
          {(payment.orderId || editing) && (
            <div className="settings-card">
              <div><strong>关联订单</strong></div>
              {editing ? <input className="page-input" value={orderId} onChange={(event) => setOrderId(event.target.value)} placeholder="留空表示不关联订单" /> : (
                <Link href={`/orders/${payment.orderId}`} style={{ color: "var(--c-4a90e6)", fontSize: 13 }}>
                  查看订单 <AppIcon name="chevron" className="inline-flow-arrow" />
                </Link>
              )}
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
        <ConfirmDialog
          open={Boolean(statusConfirm)}
          title={statusConfirm === "refunded" ? "登记退款" : "更新付款状态"}
          message={statusConfirm === "refunded" ? "确认该笔付款已经退款吗？登记后不能直接恢复。" : "确认更新这笔付款的业务状态吗？"}
          confirmLabel="确认更新"
          loading={saving}
          onConfirm={updateStatus}
          onCancel={() => setStatusConfirm(null)}
        />
      </div>
    </div>
  );
}
