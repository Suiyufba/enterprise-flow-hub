"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import { StatusBadge } from "../../components/StatusBadge";
import { AppIcon } from "../../components/AppIcon";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import type { Order } from "shared";

const statusLabels: Record<string, string> = {
  draft: "草稿", confirmed: "已确认", processing: "处理中",
  shipped: "已发货", delivered: "已交付", cancelled: "已取消", refunded: "已退款",
};

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchJson<Order>(`/orders/${id}`, { adminUserId: user?.id })
      .then((data) => {
        setOrder(data);
        setNotes(data.notes);
        if (data.status === "draft" && new URLSearchParams(window.location.search).get("edit") === "1") setEditing(true);
      })
      .catch(() => {
        setError("加载订单失败，请检查网络连接后重试");
        showToast("加载订单失败", "error");
      })
      .finally(() => setLoading(false));
  }, [id, user?.id, showToast]);

  async function updateStatus(newStatus: string) {
    setUpdating(true);
    try {
      const updated = await fetchJson<Order>(`/orders/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
        adminUserId: user?.id,
      });
      setOrder(updated);
      showToast("状态已更新", "success");
    } catch { showToast("更新失败", "error"); }
    finally { setUpdating(false); }
  }

  async function saveOrder() {
    if (!order) return;
    setSaving(true);
    try {
      const updated = await fetchJson<Order>(`/orders/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ notes: notes.trim() }),
        adminUserId: user?.id,
      });
      setOrder({ ...order, ...updated });
      setEditing(false);
      showToast("订单备注已保存", "success");
    } catch { showToast("订单保存失败", "error"); }
    finally { setSaving(false); }
  }

  async function deleteOrder() {
    setDeleting(true);
    try {
      await fetchJson(`/orders/${id}`, { method: "DELETE", adminUserId: user?.id });
      showToast("草稿订单已删除", "success");
      router.push("/orders");
    } catch { showToast("订单删除失败", "error"); }
    finally { setDeleting(false); setDeleteOpen(false); }
  }

  const nextStatuses: Record<string, string[]> = {
    draft: ["confirmed", "cancelled"],
    confirmed: ["processing", "cancelled"],
    processing: ["shipped", "cancelled"],
    shipped: ["delivered"],
    delivered: ["refunded"],
    cancelled: [],
    refunded: [],
  };

  if (loading) {
    return (
      <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
        <div className="page-shell"><div className="loading"><div className="spinner" /></div></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
        <div className="page-shell">
          <p style={{ color: "var(--c-ff3b30)", textAlign: "center", padding: 48 }}>{error}</p>
          <div style={{ textAlign: "center" }}>
            <button className="page-primary-button" onClick={() => { setError(null); setLoading(true); window.location.reload(); }}>
              重试
            </button>
            <span style={{ margin: "0 10px" }} />
            <button className="page-secondary-button" onClick={() => router.push("/orders")}>返回列表</button>
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
        <div className="page-shell">
          <p style={{ color: "var(--c-8c8c8c)", textAlign: "center", padding: 48 }}>订单不存在</p>
          <div style={{ textAlign: "center" }}>
            <button className="page-secondary-button" onClick={() => router.push("/orders")}>返回列表</button>
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
            <button className="chat-back" onClick={() => router.push("/orders")} type="button" aria-label="返回列表"><AppIcon name="arrow-left" /></button>
            <h1>订单 {order.id.slice(0, 12)}</h1>
          </div>
          {order.status === "draft" && (
            <div className="page-header-controls">
              {editing ? (
                <>
                  <button className="page-secondary-button" onClick={() => { setNotes(order.notes); setEditing(false); }} disabled={saving} type="button">取消</button>
                  <button className="page-primary-button" onClick={saveOrder} disabled={saving} type="button">{saving ? "保存中..." : "保存"}</button>
                </>
              ) : (
                <>
                  <button className="page-secondary-button" onClick={() => setEditing(true)} type="button"><AppIcon name="edit" /> 编辑备注</button>
                  <button className="page-secondary-button" onClick={() => setDeleteOpen(true)} type="button" style={{ color: "var(--c-ff3b30)" }}><AppIcon name="trash" /> 删除草稿</button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="settings-list">
          <div className="settings-card">
            <div><strong>状态</strong></div>
            <StatusBadge status={order.status} label={statusLabels[order.status] ?? order.status} />
          </div>
          <div className="settings-card">
            <div><strong>金额</strong></div>
            <span className="settings-meta">¥{order.totalAmount.toFixed(2)}</span>
          </div>
          {order.customerId && (
            <div className="settings-card">
              <div><strong>客户</strong></div>
              <Link href={`/customers/${order.customerId}`} style={{ color: "var(--c-4a90e6)", fontSize: "13px" }}>
                查看客户 <AppIcon name="chevron" className="inline-flow-arrow" />
              </Link>
            </div>
          )}
          <div className="settings-card">
            <div><strong>备注</strong></div>
            {editing ? (
              <textarea className="page-textarea order-notes-editor" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} autoFocus />
            ) : <span className="settings-meta">{order.notes || "无"}</span>}
          </div>
          <div className="settings-card">
            <div><strong>创建时间</strong></div>
            <span className="settings-meta">{order.createdAt}</span>
          </div>
          <div className="settings-card">
            <div><strong>更新时间</strong></div>
            <span className="settings-meta">{order.updatedAt}</span>
          </div>

          {order.items && order.items.length > 0 && (
            <div className="settings-card">
              <div><strong>订单项目</strong></div>
              <div style={{ marginTop: 8 }}>
                {order.items.map((item) => (
                  <div key={item.id} style={{ fontSize: "13px", padding: "4px 0", color: "var(--c-c0c0c0)" }}>
                    商品 {item.productId?.slice(0, 8)} × {item.quantity} · ¥{item.subtotal.toFixed(2)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {!editing && nextStatuses[order.status]?.length > 0 && (
          <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {nextStatuses[order.status].map((ns) => (
              <button
                key={ns}
                className="page-secondary-button"
                onClick={() => updateStatus(ns)}
                disabled={updating}
                type="button"
              >
                {updating ? "更新中..." : <><AppIcon name="chevron" className="status-next-icon" /> {statusLabels[ns] ?? ns}</>}
              </button>
            ))}
          </div>
        )}
        <ConfirmDialog
          open={deleteOpen}
          title="删除草稿订单"
          message={`确定删除订单 ${order.id.slice(0, 12)} 吗？订单项目也会一并删除，此操作不可撤销。`}
          loading={deleting}
          onConfirm={deleteOrder}
          onCancel={() => setDeleteOpen(false)}
        />
      </div>
    </div>
  );
}
