"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchJson } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import { useToast } from "../lib/toast-context";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { ErrorState } from "../components/ErrorState";
import { DataTable } from "../components/DataTable";
import { AppIcon } from "../components/AppIcon";
import { TableRowActions } from "../components/TableRowActions";
import { EnterpriseBadge, EnterpriseScopeSelect, ProjectBadge, ProjectScopeSelect } from "../components/ProjectScopeSelect";
import type { Invoice, PaginatedList } from "shared";

const statusLabels: Record<string, string> = {
  draft: "草稿", issued: "已开具", paid: "已付款", overdue: "已逾期", cancelled: "已取消",
};

const invoiceTypeLabels: Record<string, string> = {
  vat_special: "增值税专用发票",
  vat_normal: "增值税普通发票",
  electronic: "电子发票",
};

export default function InvoicesPage() {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  const [enterpriseFilter, setEnterpriseFilter] = useState("");
  const enterprises = user?.role === "admin" ? workspace.enterprises : workspace.enterprises.filter((enterprise) => enterprise.id === user?.enterpriseId);
  const enterpriseId = enterpriseFilter || user?.enterpriseId || enterprises[0]?.id;
  const projects = workspace.projects.filter((project) => project.enterpriseId === enterpriseId);
  const [data, setData] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  useEffect(() => { if (!enterpriseFilter && user?.enterpriseId) setEnterpriseFilter(user.enterpriseId); }, [enterpriseFilter, user?.enterpriseId]);
  const load = useCallback(async () => {
    if (!enterpriseId) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ enterpriseId, page: String(page), limit: "20" });
      if (statusFilter) params.set("status", statusFilter);
      if (projectFilter) params.set("projectId", projectFilter);
      const res = await fetchJson<PaginatedList<Invoice>>(`/invoices?${params}`, { adminUserId: user?.id });
      setData(res.items);
      setTotal(res.total);
    } catch { showToast("加载失败", "error"); setError("加载失败，请检查网络后重试"); }
    finally { setLoading(false); }
  }, [enterpriseId, page, projectFilter, statusFilter, showToast, user?.id]);

  useEffect(() => { load(); }, [load]);

  const [amount, setAmount] = useState("");
  const [projectId, setProjectId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceCode, setInvoiceCode] = useState("");
  const [invoiceType, setInvoiceType] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerTaxId, setBuyerTaxId] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [sellerTaxId, setSellerTaxId] = useState("");
  const [remark, setRemark] = useState("");
  const [issuer, setIssuer] = useState("");
  const [saving, setSaving] = useState(false);

  async function createInvoice() {
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0 || !enterpriseId || !projectId) return;
    setSaving(true);
    try {
      await fetchJson("/invoices", {
        method: "POST",
        body: JSON.stringify({
          enterpriseId,
          projectId,
          orderId: orderId.trim() || undefined,
          customerId: customerId.trim() || undefined,
          amount: parseFloat(amount),
          dueDate: dueDate || undefined,
          invoiceNumber: invoiceNumber.trim() || undefined,
          invoiceCode: invoiceCode.trim() || undefined,
          invoiceType: invoiceType || undefined,
          taxRate: taxRate ? parseFloat(taxRate) : undefined,
          buyerName: buyerName.trim() || undefined,
          buyerTaxId: buyerTaxId.trim() || undefined,
          sellerName: sellerName.trim() || undefined,
          sellerTaxId: sellerTaxId.trim() || undefined,
          remark: remark.trim() || undefined,
          issuer: issuer.trim() || undefined,
        }),
        adminUserId: user?.id,
      });
      setAmount(""); setProjectId(""); setOrderId(""); setCustomerId(""); setDueDate("");
      setInvoiceNumber(""); setInvoiceCode(""); setInvoiceType("");
      setTaxRate(""); setBuyerName(""); setBuyerTaxId("");
      setSellerName(""); setSellerTaxId(""); setRemark(""); setIssuer("");
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
      width: "142px",
      render: (inv: Invoice) => (
        <Link href={`/invoices/${inv.id}`} style={{ fontFamily: "monospace", fontSize: "12px", color: "var(--c-f0f0f0)", textDecoration: "none", fontWeight: 600, whiteSpace: "nowrap" }}>
          {inv.id.slice(0, 12)}
        </Link>
      ),
    },
    { key: "enterpriseId", label: "所属企业", width: "120px", render: (inv: Invoice) => <EnterpriseBadge enterprises={workspace.enterprises} enterpriseId={inv.enterpriseId} /> },
    { key: "projectId", label: "业务子类", width: "120px", render: (inv: Invoice) => <ProjectBadge projects={workspace.projects} projectId={inv.projectId} /> },
    { key: "invoiceNumber", label: "发票号码", width: "112px", render: (inv: Invoice) => inv.invoiceNumber ?? "-" },
    {
      key: "invoiceType",
      label: "发票类型",
      width: "136px",
      render: (inv: Invoice) => (inv.invoiceType ? invoiceTypeLabels[inv.invoiceType] ?? inv.invoiceType : "-"),
    },
    {
      key: "taxRate",
      label: "税率",
      width: "72px",
      render: (inv: Invoice) => (inv.taxRate != null ? `${(inv.taxRate * 100).toFixed(0)}%` : "-"),
    },
    { key: "amount", label: "金额", width: "120px", render: (inv: Invoice) => `¥${inv.amount.toFixed(2)}` },
    {
      key: "totalAmount",
      label: "价税合计",
      width: "124px",
      render: (inv: Invoice) => (inv.totalAmount != null ? `¥${inv.totalAmount.toFixed(2)}` : "-"),
    },
    { key: "status", label: "状态", width: "90px", render: (inv: Invoice) => <StatusBadge status={inv.status} label={statusLabels[inv.status] ?? inv.status} /> },
    { key: "dueDate", label: "到期日", width: "118px", render: (inv: Invoice) => inv.dueDate?.slice(0, 10) ?? "-" },
    {
      key: "orderId",
      label: "关联订单",
      width: "150px",
      render: (inv: Invoice) =>
        inv.orderId ? (
          <Link href={`/orders/${inv.orderId}`} style={{ fontFamily: "monospace", fontSize: 11, color: "var(--c-4a90e6)", textDecoration: "none", whiteSpace: "nowrap" }}>
            {inv.orderId.slice(0, 12)}
          </Link>
        ) : <span style={{ color: "var(--c-8c8c8c)", fontSize: 12 }}>-</span>,
    },
    { key: "createdAt", label: "创建时间", width: "118px", render: (inv: Invoice) => inv.createdAt?.slice(0, 10) },
    {
      key: "actions",
      label: "操作",
      width: "150px",
      render: (inv: Invoice) => <TableRowActions viewHref={`/invoices/${inv.id}`} editHref={inv.status === "draft" ? `/invoices/${inv.id}?edit=1` : undefined} />,
    },
  ];

  return (
    <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
      <div className="page-shell invoice-page-shell">
        <PageHeader
          title="发票管理"
          description="管理所有发票，跟踪开票和付款状态"
          actions={
            <button className="page-primary-button" onClick={() => setShowForm(!showForm)} type="button">
              {showForm ? <><AppIcon name="x" /> 取消</> : <><AppIcon name="plus" /> 新建发票</>}
            </button>
          }
        />

        {showForm && (
          <div className="settings-card" style={{ marginBottom: 14, borderColor: "var(--c-4a90e6)" }}>
            <div className="settings-edit-form">
              <label className="form-label" htmlFor="invoice-enterprise">所属企业 *</label>
              <EnterpriseScopeSelect id="invoice-enterprise" enterprises={enterprises} value={enterpriseId ?? ""} onChange={(value) => { setEnterpriseFilter(value); setProjectId(""); }} className="page-input" ariaLabel="发票所属企业" />
              <label className="form-label" htmlFor="invoice-project">业务子类 *</label>
              <ProjectScopeSelect id="invoice-project" projects={projects} value={projectId} onChange={setProjectId} includeAll={false} className="page-input" ariaLabel="发票业务子类" />
              <label className="form-label" htmlFor="invoice-amount">金额 *</label>
              <input id="invoice-amount" className="page-input" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="金额 *" />

              <label className="form-label" htmlFor="invoice-number">发票号码</label>
              <input id="invoice-number" className="page-input" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="发票号码" />

              <label className="form-label" htmlFor="invoice-code">发票代码</label>
              <input id="invoice-code" className="page-input" value={invoiceCode} onChange={(e) => setInvoiceCode(e.target.value)} placeholder="发票代码" />

              <label className="form-label" htmlFor="invoice-type">发票类型</label>
              <select id="invoice-type" className="page-input" value={invoiceType} onChange={(e) => setInvoiceType(e.target.value)}>
                <option value="">请选择</option>
                <option value="vat_special">增值税专用发票</option>
                <option value="vat_normal">增值税普通发票</option>
                <option value="electronic">电子发票</option>
              </select>

              <label className="form-label" htmlFor="invoice-taxRate">税率（%）</label>
              <select id="invoice-taxRate" className="page-input" value={taxRate} onChange={(e) => setTaxRate(e.target.value)}>
                <option value="">请选择</option>
                <option value="0">0%</option>
                <option value="0.01">1%</option>
                <option value="0.03">3%</option>
                <option value="0.06">6%</option>
                <option value="0.09">9%</option>
                <option value="0.13">13%</option>
              </select>

              <label className="form-label" htmlFor="invoice-buyerName">购买方名称</label>
              <input id="invoice-buyerName" className="page-input" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="购买方名称" />

              <label className="form-label" htmlFor="invoice-buyerTaxId">购买方税号</label>
              <input id="invoice-buyerTaxId" className="page-input" value={buyerTaxId} onChange={(e) => setBuyerTaxId(e.target.value)} placeholder="购买方税号" />

              <label className="form-label" htmlFor="invoice-sellerName">销售方名称</label>
              <input id="invoice-sellerName" className="page-input" value={sellerName} onChange={(e) => setSellerName(e.target.value)} placeholder="销售方名称" />

              <label className="form-label" htmlFor="invoice-sellerTaxId">销售方税号</label>
              <input id="invoice-sellerTaxId" className="page-input" value={sellerTaxId} onChange={(e) => setSellerTaxId(e.target.value)} placeholder="销售方税号" />

              <label className="form-label" htmlFor="invoice-orderid">关联订单 ID（可选）</label>
              <input id="invoice-orderid" className="page-input" value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="关联订单 ID（可选）" />

              <label className="form-label" htmlFor="invoice-customerid">关联客户 ID（可选）</label>
              <input id="invoice-customerid" className="page-input" value={customerId} onChange={(e) => setCustomerId(e.target.value)} placeholder="关联客户 ID（可选）" />

              <label className="form-label" htmlFor="invoice-duedate">到期日</label>
              <input id="invoice-duedate" className="page-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} placeholder="到期日" />

              <label className="form-label" htmlFor="invoice-remark">备注</label>
              <input id="invoice-remark" className="page-input" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="备注" />

              <label className="form-label" htmlFor="invoice-issuer">开票人</label>
              <input id="invoice-issuer" className="page-input" value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="开票人" />

              <button className="page-primary-button" onClick={createInvoice} disabled={saving || !enterpriseId || !projectId || !amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0} type="button">
                {saving ? "创建中..." : "确认创建"}
              </button>
            </div>
          </div>
        )}

        <div className="page-toolbar" style={{ display: "flex", gap: "10px", marginBottom: "14px" }}>
          <EnterpriseScopeSelect enterprises={enterprises} value={enterpriseId ?? ""} onChange={(value) => { setEnterpriseFilter(value); setProjectFilter(""); setPage(1); }} ariaLabel="按所属企业筛选" />
          <ProjectScopeSelect projects={projects} value={projectFilter} onChange={(value) => { setProjectFilter(value); setPage(1); }} />
          <select className="search-enterprise-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">全部状态</option>
            <option value="draft">草稿</option>
            <option value="issued">已开具</option>
            <option value="paid">已付款</option>
            <option value="overdue">已逾期</option>
            <option value="cancelled">已取消</option>
          </select>
        </div>

        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <DataTable
            className="invoice-table-wrap erp-table-wrap"
            columns={columns}
            data={data}
            loading={loading}
            total={total}
            page={page}
            onPageChange={setPage}
            emptyTitle="暂无发票"
            emptyDesc="还没有任何发票记录"
            emptyAction={<button className="page-primary-button" onClick={() => setShowForm(true)} type="button">新建发票</button>}
          />
        )}
      </div>
    </div>
  );
}
