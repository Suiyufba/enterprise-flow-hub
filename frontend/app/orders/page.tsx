"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import { useToast } from "../lib/toast-context";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { DataTable } from "../components/DataTable";
import { gsap, useGSAP } from "../lib/gsap";
import type { Order, PaginatedList } from "shared";

export default function OrdersPage() {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  const enterpriseId = user?.enterpriseId ?? workspace.enterprises[0]?.id;
  const [data, setData] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
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
      const res = await fetchJson<PaginatedList<Order>>(`/orders?${params}`, { adminUserId: user?.id });
      setData(res.items);
      setTotal(res.total);
    } catch { showToast("加载失败", "error"); }
    finally { setLoading(false); }
  }, [enterpriseId, page, statusFilter, showToast, user?.id]);

  useEffect(() => { load(); }, [load]);

  const columns = [
    { key: "id", label: "订单号", render: (o: Order) => <span style={{ fontFamily: "monospace", fontSize: "12px" }}>{o.id.slice(0, 12)}</span> },
    { key: "totalAmount", label: "金额", render: (o: Order) => `¥${o.totalAmount.toFixed(2)}` },
    { key: "status", label: "状态", render: (o: Order) => <StatusBadge status={o.status} /> },
    { key: "createdAt", label: "创建时间" },
  ];

  return (
    <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
      <div className="page-shell" ref={pageRef}>
        <PageHeader title="订单管理" description="管理所有订单、付款和发票" />
        <div style={{ marginBottom: "14px" }}>
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
        <DataTable columns={columns} data={data} loading={loading} total={total} page={page} onPageChange={setPage} emptyTitle="暂无订单" />
      </div>
    </div>
  );
}
