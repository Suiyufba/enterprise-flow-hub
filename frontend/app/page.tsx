"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fetchJson } from "./lib/api";
import { useAuth } from "./lib/auth-context";
import { useWorkspace } from "./lib/workspace-context";
import { useToast } from "./lib/toast-context";
import { StatCard } from "./components/StatCard";
import { StatusBadge } from "./components/StatusBadge";
import { AppIcon } from "./components/AppIcon";
import { gsap, useGSAP } from "./lib/gsap";
import type { Customer, Invoice, Order, Payment, Product, Supplier, PaginatedList } from "shared";

type BusinessTotals = {
  customers: number;
  suppliers: number;
  products: number;
  invoices: number;
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  const pageRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap.from(".stat-card", { y: 16, autoAlpha: 0, duration: 0.4, stagger: 0.07, ease: "power3.out", delay: 0.1 });
    gsap.from(".dashboard-card", { y: 12, autoAlpha: 0, duration: 0.35, stagger: 0.08, ease: "power3.out", delay: 0.2 });
  }, { scope: pageRef });

  const enterpriseId = user?.enterpriseId ?? workspace.enterprises[0]?.id;
  const enterpriseProjects = workspace.projects.filter((p) => p.enterpriseId === enterpriseId);
  const enterpriseConversations = workspace.conversations.filter((c) => c.enterpriseId === enterpriseId);

  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [recentPayments, setRecentPayments] = useState<Payment[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [revenueTotal, setRevenueTotal] = useState(0);
  const [orderTotal, setOrderTotal] = useState(0);
  const [businessTotals, setBusinessTotals] = useState<BusinessTotals>({
    customers: 0,
    suppliers: 0,
    products: 0,
    invoices: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (!enterpriseId || !user?.id) return;
    setStatsLoading(true);
    Promise.all([
      fetchJson<PaginatedList<Order>>(`/orders?enterpriseId=${enterpriseId}&limit=50`, { adminUserId: user?.id }),
      fetchJson<PaginatedList<Payment>>(`/payments?enterpriseId=${enterpriseId}&limit=50`, { adminUserId: user?.id }),
      fetchJson<PaginatedList<Invoice>>(`/invoices?enterpriseId=${enterpriseId}&limit=50`, { adminUserId: user?.id }),
      fetchJson<PaginatedList<Customer>>(`/customers?enterpriseId=${enterpriseId}&limit=1`, { adminUserId: user?.id }),
      fetchJson<PaginatedList<Supplier>>(`/suppliers?enterpriseId=${enterpriseId}&limit=1`, { adminUserId: user?.id }),
      fetchJson<PaginatedList<Product>>(`/products?enterpriseId=${enterpriseId}&limit=1`, { adminUserId: user?.id }),
    ])
      .then(([ordersRes, paymentsRes, invoicesRes, customersRes, suppliersRes, productsRes]) => {
        setRecentOrders(ordersRes.items);
        setOrderTotal(ordersRes.total);
        setRecentPayments(paymentsRes.items);
        setRecentInvoices(invoicesRes.items);
        setRevenueTotal(paymentsRes.items.filter((p) => p.status === "completed").reduce((sum, p) => sum + p.amount, 0));
        setBusinessTotals({
          customers: customersRes.total,
          suppliers: suppliersRes.total,
          products: productsRes.total,
          invoices: invoicesRes.total,
        });
      })
      .catch(() => showToast("加载统计数据失败", "error"))
      .finally(() => setStatsLoading(false));
  }, [enterpriseId, user?.id, showToast]);

  const orderStatusCounts: Record<string, number> = {};
  for (const o of recentOrders) {
    orderStatusCounts[o.status] = (orderStatusCounts[o.status] || 0) + 1;
  }

  const statusItems = [
    ["draft", "草稿"], ["confirmed", "已确认"], ["processing", "处理中"],
    ["shipped", "已发货"], ["delivered", "已交付"], ["cancelled", "已取消"],
  ];

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthRevenue = recentPayments
    .filter((p) => p.status === "completed" && (p.receivedAt ?? p.createdAt)?.startsWith(currentMonth))
    .reduce((sum, p) => sum + p.amount, 0);
  const pendingOrderCount = recentOrders.filter((o) => ["confirmed", "processing"].includes(o.status)).length;
  const deliveredOrderCount = recentOrders.filter((o) => o.status === "delivered").length;
  const pendingInvoiceCount = recentInvoices.filter((inv) => ["draft", "issued"].includes(inv.status)).length;
  const overdueInvoiceCount = recentInvoices.filter((inv) => {
    if (inv.status === "overdue") return true;
    if (!inv.dueDate || ["paid", "cancelled"].includes(inv.status)) return false;
    return new Date(inv.dueDate) < now;
  }).length;
  const activeWorkflowCount = workspace.automations.filter((a) => {
    const proj = workspace.projects.find((p) => p.id === a.projectId);
    return proj?.enterpriseId === enterpriseId && a.enabled;
  }).length;

  return (
    <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
      <div className="page-shell dashboard-page-shell" ref={pageRef}>
        <div className="page-header">
          <div className="page-header-left">
            <h1>仪表盘</h1>
            <p>
              欢迎回来{user ? `，${user.displayName}` : ""}
              {workspace.enterprises.find((e) => e.id === enterpriseId)
                ? ` — ${workspace.enterprises.find((e) => e.id === enterpriseId)!.name}`
                : ""}
            </p>
          </div>
        </div>

        <div className="dashboard-grid">
          <StatCard label="收入总额" value={statsLoading ? "..." : `¥${revenueTotal.toLocaleString()}`} icon="payment" />
          <StatCard label="本月收入" value={statsLoading ? "..." : `¥${monthRevenue.toLocaleString()}`} icon="chart" />
          <StatCard label="订单总数" value={statsLoading ? "..." : orderTotal} icon="clipboard" />
          <StatCard label="待处理订单" value={statsLoading ? "..." : pendingOrderCount} icon="sync" />
        </div>

        <div className="dashboard-grid" style={{ marginTop: 16 }}>
          <StatCard label="待处理发票" value={statsLoading ? "..." : pendingInvoiceCount} icon="invoice" />
          <StatCard label="逾期发票" value={statsLoading ? "..." : overdueInvoiceCount} icon="alert" trend={overdueInvoiceCount > 0 ? { direction: "down", text: "需要处理" } : undefined} />
          <StatCard label="客户" value={statsLoading ? "..." : businessTotals.customers} icon="user" />
          <StatCard label="商品" value={statsLoading ? "..." : businessTotals.products} icon="table" />
        </div>

        <div className="dashboard-health-strip">
          <Link href="/orders" className="dashboard-health-item">
            <span>订单交付</span>
            <strong>{statsLoading ? "..." : `${deliveredOrderCount}/${recentOrders.length || 0}`}</strong>
          </Link>
          <Link href="/invoices" className="dashboard-health-item">
            <span>发票池</span>
            <strong>{statsLoading ? "..." : businessTotals.invoices}</strong>
          </Link>
          <Link href="/suppliers" className="dashboard-health-item">
            <span>供应商</span>
            <strong>{statsLoading ? "..." : businessTotals.suppliers}</strong>
          </Link>
          <Link href="/automation" className="dashboard-health-item">
            <span>运行中自动化</span>
            <strong>{activeWorkflowCount}</strong>
          </Link>
          <Link href="/library" className="dashboard-health-item">
            <span>资料库</span>
            <strong>{workspace.libraryItems.filter((l) => l.enterpriseId === enterpriseId).length}</strong>
          </Link>
          <Link href="/projects" className="dashboard-health-item dashboard-health-action">
            <span>项目</span>
            <strong>{enterpriseProjects.length}</strong>
          </Link>
        </div>

        <div className="dashboard-cards" style={{ marginTop: 20 }}>
          <div className="dashboard-card">
            <h3>快速操作</h3>
            <div className="dashboard-actions">
              <Link href="/chat/new" className="dashboard-action-btn">
                <AppIcon name="chat" /> 新建对话
              </Link>
              <Link href="/projects/new" className="dashboard-action-btn">
                <AppIcon name="project" /> 新建项目
              </Link>
              <Link href="/orders/new" className="dashboard-action-btn">
                <AppIcon name="clipboard" /> 新建订单
              </Link>
              <Link href="/library" className="dashboard-action-btn">
                <AppIcon name="library" /> 上传资料
              </Link>
              <Link href="/payments" className="dashboard-action-btn">
                <AppIcon name="payment" /> 付款管理
              </Link>
              <Link href="/invoices" className="dashboard-action-btn">
                <AppIcon name="invoice" /> 发票管理
              </Link>
            </div>
          </div>

          <div className="dashboard-card">
            <h3>最近对话</h3>
            <div className="dashboard-recent-list">
              {enterpriseConversations.slice(0, 5).length === 0 ? (
                <p style={{ color: "var(--c-8c8c8c)", fontSize: "13px", padding: "8px 0" }}>
                  还没有对话，开始一个新对话吧
                </p>
              ) : (
                enterpriseConversations
                  .slice(0, 5)
                  .map((conv) => (
                    <Link
                      key={conv.id}
                      href={`/chat/${conv.id}`}
                      className="dashboard-recent-item"
                    >
                      <AppIcon name="chat" className="dashboard-inline-icon" />
                      <span className="item-title">{conv.title}</span>
                      <span className="item-time">
                        {conv.createdAt?.slice(0, 10)}
                      </span>
                    </Link>
                  ))
              )}
            </div>
          </div>
        </div>

        <div className="dashboard-cards" style={{ marginTop: 20 }}>
          <div className="dashboard-card">
            <h3>订单状态分布</h3>
            <div>
              {statusItems.map(([status, label]) => {
                const count = orderStatusCounts[status] || 0;
                if (count === 0) return null;
                return (
                  <div key={status} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--c-2a2a2a)" }}>
                    <span style={{ color: "var(--c-c0c0c0)" }}>{label}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>{count}</span>
                      <StatusBadge status={status} />
                    </div>
                  </div>
                );
              })}
              {statsLoading && <p style={{ color: "var(--c-8c8c8c)", fontSize: 13 }}>加载中...</p>}
              {!statsLoading && Object.keys(orderStatusCounts).length === 0 && (
                <p style={{ color: "var(--c-8c8c8c)", fontSize: 13, padding: "8px 0" }}>暂无订单数据</p>
              )}
            </div>
            <Link href="/orders" style={{ display: "block", marginTop: 10, fontSize: 12, color: "var(--c-4a90e6)", textDecoration: "none" }}>
              查看全部订单 →
            </Link>
          </div>

          <div className="dashboard-card">
            <h3>最近付款</h3>
            <div className="dashboard-recent-list">
              {statsLoading ? (
                <p style={{ color: "var(--c-8c8c8c)", fontSize: 13, padding: "8px 0" }}>加载中...</p>
              ) : recentPayments.slice(0, 5).length === 0 ? (
                <p style={{ color: "var(--c-8c8c8c)", fontSize: 13, padding: "8px 0" }}>暂无付款记录</p>
              ) : (
                recentPayments.slice(0, 5).map((p) => (
                  <div key={p.id} className="dashboard-recent-item">
                    <AppIcon name="payment" className="dashboard-inline-icon" />
                    <span className="item-title" style={{ color: "var(--c-f0f0f0)", fontWeight: 600 }}>
                      ¥{p.amount.toFixed(2)}
                    </span>
                    <StatusBadge status={p.status} />
                    <span className="item-time">{p.createdAt?.slice(0, 10)}</span>
                  </div>
                ))
              )}
            </div>
            <Link href="/payments" style={{ display: "block", marginTop: 10, fontSize: 12, color: "var(--c-4a90e6)", textDecoration: "none" }}>
              查看全部付款 →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
