"use client";

import { useEffect, useState, use, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchJson, fetchWithAuth } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { useToast } from "../../lib/toast-context";
import { StatusBadge } from "../../components/StatusBadge";
import { ErrorState } from "../../components/ErrorState";
import { AppIcon } from "../../components/AppIcon";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ProjectBadge, ProjectScopeSelect } from "../../components/ProjectScopeSelect";
import type { Invoice } from "shared";

const invoiceTypeLabels: Record<string, string> = {
  vat_special: "增值税专用发票",
  vat_normal: "增值税普通发票",
  electronic: "电子发票",
};

const taxRateOptions = [
  { value: 0, label: "0%" },
  { value: 0.01, label: "1%" },
  { value: 0.03, label: "3%" },
  { value: 0.06, label: "6%" },
  { value: 0.09, label: "9%" },
  { value: 0.13, label: "13%" },
];

function editFormForInvoice(target: Invoice) {
  return {
    projectId: target.projectId,
    invoiceNumber: target.invoiceNumber ?? "",
    invoiceCode: target.invoiceCode ?? "",
    invoiceType: target.invoiceType ?? "",
    amount: target.amount,
    taxRate: target.taxRate,
    taxAmount: target.taxAmount,
    totalAmount: target.totalAmount,
    buyerName: target.buyerName ?? "",
    buyerTaxId: target.buyerTaxId ?? "",
    sellerName: target.sellerName ?? "",
    sellerTaxId: target.sellerTaxId ?? "",
    remark: target.remark ?? "",
    issuer: target.issuer ?? "",
    dueDate: target.dueDate?.slice(0, 10) ?? "",
    issuedAt: target.issuedAt?.slice(0, 10) ?? "",
  };
}

const DIGITS = ["零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"];
const UNITS = ["", "拾", "佰", "仟"];
const BIG_UNITS = ["", "万", "亿"];

function toChineseUpper(num: number): string {
  if (num === 0) return "零元整";
  if (num < 0) return "负" + toChineseUpper(-num);

  const yuan = Math.floor(num);
  const jiao = Math.round((num - yuan) * 100) % 100;

  // Integer part
  let intPart = "";
  if (yuan === 0) {
    intPart = "零";
  } else {
    const str = String(yuan);
    const len = str.length;
    for (let i = 0; i < len; i++) {
      const digit = parseInt(str[i]);
      const pos = len - i - 1;
      const unit = UNITS[pos % 4];
      const bigUnit = BIG_UNITS[Math.floor(pos / 4)];

      if (digit === 0) {
        if (pos % 4 === 0 && bigUnit) {
          intPart += bigUnit;
        } else if (i + 1 < len && parseInt(str[i + 1]) !== 0 && intPart[intPart.length - 1] !== "零") {
          intPart += "零";
        }
      } else {
        intPart += DIGITS[digit] + unit + (pos % 4 === 0 ? bigUnit : "");
      }
    }
  }
  intPart += "元";

  // Fraction part
  if (jiao === 0) {
    return intPart + "整";
  }
  const jiaoDigit = Math.floor(jiao / 10);
  const fenDigit = jiao % 10;
  if (jiaoDigit > 0) intPart += DIGITS[jiaoDigit] + "角";
  if (fenDigit > 0) intPart += DIGITS[fenDigit] + "分";
  else intPart += "整";

  return intPart;
}

// ---- Inline form input styles ----
const editInput: React.CSSProperties = {
  width: "100%",
  padding: "6px 10px",
  fontSize: 13,
  border: "1px solid var(--c-e0e0e0)",
  borderRadius: 6,
  backgroundColor: "var(--bg, #fff)",
  color: "var(--c-c0c0c0)",
  outline: "none",
  boxSizing: "border-box",
};

const editSelect: React.CSSProperties = {
  ...editInput,
  cursor: "pointer",
};

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const projects = workspace.projects.filter((project) => project.enterpriseId === invoice?.enterpriseId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---- Edit mode ----
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [statusConfirm, setStatusConfirm] = useState<Invoice["status"] | null>(null);

  // Form fields that track edits
  const [editForm, setEditForm] = useState({
    projectId: "",
    invoiceNumber: "",
    invoiceCode: "",
    invoiceType: "" as string,
    amount: 0,
    taxRate: null as number | null,
    taxAmount: null as number | null,
    totalAmount: null as number | null,
    buyerName: "",
    buyerTaxId: "",
    sellerName: "",
    sellerTaxId: "",
    remark: "",
    issuer: "",
    dueDate: "",
    issuedAt: "",
  });

  const fetchInvoice = useCallback(() => {
    setError(null);
    setLoading(true);
    fetchJson<Invoice>(`/invoices/${id}`, { adminUserId: user?.id })
      .then((found) => {
        setInvoice(found);
        if (found.status === "draft" && new URLSearchParams(window.location.search).get("edit") === "1") {
          setEditForm(editFormForInvoice(found));
          setIsEditing(true);
        }
      })
      .catch(() => {
        setError("加载发票详情失败");
        showToast("加载发票信息失败", "error");
      })
      .finally(() => setLoading(false));
  }, [id, user?.id, showToast]);

  useEffect(() => {
    fetchInvoice();
  }, [fetchInvoice]);

  // ---- Enter edit mode: populate form from current invoice ----
  function handleEdit(target: Invoice | null = invoice) {
    if (!target) return;
    setEditForm(editFormForInvoice(target));
    setIsEditing(true);
  }

  const handleCancel = () => {
    setIsEditing(false);
  };

  // ---- Save changes ----
  const handleSave = async () => {
    if (!invoice) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        projectId: editForm.projectId,
        invoiceNumber: editForm.invoiceNumber || null,
        invoiceCode: editForm.invoiceCode || null,
        invoiceType: editForm.invoiceType || null,
        amount: editForm.amount,
        taxRate: editForm.taxRate,
        taxAmount: editForm.taxAmount,
        totalAmount: editForm.totalAmount,
        buyerName: editForm.buyerName || null,
        buyerTaxId: editForm.buyerTaxId || null,
        sellerName: editForm.sellerName || null,
        sellerTaxId: editForm.sellerTaxId || null,
        remark: editForm.remark || null,
        issuer: editForm.issuer || null,
        dueDate: editForm.dueDate ? new Date(editForm.dueDate).toISOString() : null,
        issuedAt: editForm.issuedAt ? new Date(editForm.issuedAt).toISOString() : null,
      };
      await fetchJson(`/invoices/${invoice.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
        adminUserId: user?.id,
      });
      showToast("发票已更新", "success");
      setIsEditing(false);
      fetchInvoice(); // refresh
    } catch {
      showToast("保存失败", "error");
    } finally {
      setSaving(false);
    }
  };

  // ---- Delete ----
  const handleDelete = async () => {
    if (!invoice) return;
    setDeleting(true);
    try {
      await fetchJson(`/invoices/${invoice.id}`, {
        method: "DELETE",
        adminUserId: user?.id,
      });
      showToast("发票已删除", "success");
      router.push("/invoices");
    } catch {
      showToast("删除失败", "error");
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const handleStatusUpdate = async () => {
    if (!invoice || !statusConfirm) return;
    setSaving(true);
    try {
      const updated = await fetchJson<Invoice>(`/invoices/${invoice.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: statusConfirm }),
        adminUserId: user?.id,
      });
      setInvoice(updated);
      showToast("发票状态已更新", "success");
    } catch { showToast("发票状态更新失败", "error"); }
    finally { setSaving(false); setStatusConfirm(null); }
  };

  const openSourceImage = async () => {
    if (!invoice?.sourceFileId) return;
    try {
      const response = await fetchWithAuth(`/files/${invoice.sourceFileId}/download`);
      if (!response.ok) throw new Error(await response.text());
      const url = URL.createObjectURL(await response.blob());
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      showToast("原始票据加载失败", "error");
    }
  };

  // ---- Shared form change handler ----
  const updateField = (field: string, value: string | number | null) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  // ---- Early returns ----

  if (error) {
    return (
      <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
        <div className="page-shell">
          <ErrorState message={error} onRetry={() => { setError(null); fetchInvoice(); }} />
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

  // ---- Styles ----

  const sectionTitle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--c-4a90e6)",
    marginBottom: 12,
    paddingBottom: 8,
    borderBottom: "1px solid var(--c-e8e8e8)",
  };

  const fieldRow: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 0",
  };

  const fieldLabel: React.CSSProperties = {
    fontSize: 13,
    color: "var(--c-8c8c8c)",
    flexShrink: 0,
    marginRight: 12,
    minWidth: 72,
  };

  const fieldValue: React.CSSProperties = {
    fontSize: 13,
    color: "var(--c-c0c0c0)",
    textAlign: "right",
    wordBreak: "break-all",
  };

  // Two-column grid for cards
  const grid2: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "4px 24px",
  };

  // ---- Field render helper: view vs edit ----
  const renderField = (
    label: string,
    viewContent: React.ReactNode,
    editContent: React.ReactNode,
    options?: { fullWidth?: boolean },
  ) => (
    <div style={options?.fullWidth ? { padding: "6px 0" } : fieldRow}>
      <span style={fieldLabel}>{label}</span>
      {isEditing ? editContent : viewContent}
    </div>
  );

  // ---- Main render ----
  return (
    <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
      <div className="page-shell">
        {/* ---- Header with actions ---- */}
        <div className="page-header">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button className="chat-back" onClick={() => router.push("/invoices")} type="button" aria-label="返回发票列表"><AppIcon name="arrow-left" /></button>
            <h1>发票详情</h1>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {isEditing ? (
              <>
                <button
                  className="page-secondary-button"
                  onClick={handleCancel}
                  disabled={saving}
                  type="button"
                >
                  取消
                </button>
                <button
                  className="page-primary-button"
                  onClick={handleSave}
                  disabled={saving}
                  type="button"
                >
                  {saving ? "保存中…" : "保存"}
                </button>
              </>
            ) : (
              <>
                {invoice.sourceFileId && <button className="page-secondary-button" onClick={() => void openSourceImage()} type="button"><AppIcon name="image" /> 查看原始票据</button>}
                {invoice.status === "draft" && <button className="page-secondary-button" onClick={() => handleEdit()} type="button"><AppIcon name="edit" /> 编辑票面</button>}
                {invoice.status === "draft" && <button className="page-primary-button" onClick={() => setStatusConfirm("issued")} type="button">确认开具</button>}
                {(["issued", "overdue"] as Invoice["status"][]).includes(invoice.status) && <button className="page-primary-button" onClick={() => setStatusConfirm("paid")} type="button">标记已支付</button>}
                {invoice.status === "issued" && <button className="page-secondary-button" onClick={() => setStatusConfirm("overdue")} type="button">标记逾期</button>}
                {(["issued", "overdue"] as Invoice["status"][]).includes(invoice.status) && <button className="page-secondary-button" onClick={() => setStatusConfirm("cancelled")} type="button">作废</button>}
                {invoice.status === "draft" && <button className="page-secondary-button" onClick={() => setDeleteOpen(true)} disabled={deleting} type="button" style={{ color: "var(--c-ff3b30)" }}><AppIcon name="trash" /> 删除草稿</button>}
              </>
            )}
          </div>
        </div>

        <div className="settings-list">
          {/* 1. 基本信息 */}
          <div className="settings-card">
            <div style={sectionTitle}>基本信息</div>
            <div style={grid2}>
              <div style={fieldRow}>
                <span style={fieldLabel}>编号</span>
                <span className="settings-meta" style={{ fontFamily: "monospace", fontSize: 12 }}>{invoice.id}</span>
              </div>

              {renderField(
                "所属项目",
                <ProjectBadge projects={projects} projectId={invoice.projectId} />,
                <ProjectScopeSelect projects={projects} value={editForm.projectId} onChange={(projectId) => updateField("projectId", projectId)} includeAll={false} className="page-input" ariaLabel="发票所属项目" />,
              )}

              {renderField(
                "发票号码",
                <span style={fieldValue}>{invoice.invoiceNumber ?? "未设置"}</span>,
                <input style={editInput} value={editForm.invoiceNumber} onChange={(e) => updateField("invoiceNumber", e.target.value)} placeholder="发票号码" />,
              )}

              {renderField(
                "发票代码",
                <span style={fieldValue}>{invoice.invoiceCode ?? "未设置"}</span>,
                <input style={editInput} value={editForm.invoiceCode} onChange={(e) => updateField("invoiceCode", e.target.value)} placeholder="发票代码" />,
              )}

              {renderField(
                "发票类型",
                <span style={fieldValue}>{invoice.invoiceType ? invoiceTypeLabels[invoice.invoiceType] : "未设置"}</span>,
                <select style={editSelect} value={editForm.invoiceType} onChange={(e) => updateField("invoiceType", e.target.value)}>
                  <option value="">未设置</option>
                  {Object.entries(invoiceTypeLabels).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
                </select>,
              )}

              {renderField(
                "状态",
                <StatusBadge status={invoice.status} />,
                <StatusBadge status={invoice.status} />,
              )}

              <div style={fieldRow}>
                <span style={fieldLabel}>创建时间</span>
                <span style={fieldValue}>{invoice.createdAt}</span>
              </div>

              {/* Editable dueDate / issuedAt (only shown in edit mode) */}
              {isEditing && (<>
                <div style={fieldRow}>
                  <span style={fieldLabel}>到期日</span>
                  <input type="date" style={editInput} value={editForm.dueDate} onChange={(e) => updateField("dueDate", e.target.value)} />
                </div>
                <div style={fieldRow}>
                  <span style={fieldLabel}>开票日期</span>
                  <input type="date" style={editInput} value={editForm.issuedAt} onChange={(e) => updateField("issuedAt", e.target.value)} />
                </div>
              </>)}
            </div>
          </div>

          {/* 2. 金额信息 */}
          <div className="settings-card">
            <div style={sectionTitle}>金额信息</div>
            <div style={grid2}>
              {renderField(
                "金额（不含税）",
                <span className="settings-meta" style={{ fontSize: 14, fontWeight: 700 }}>¥{invoice.amount.toFixed(2)}</span>,
                <input type="number" step="0.01" min="0" style={editInput} value={editForm.amount} onChange={(e) => updateField("amount", parseFloat(e.target.value) || 0)} />,
              )}

              {renderField(
                "税率",
                <span style={fieldValue}>{invoice.taxRate != null ? `${(invoice.taxRate * 100).toFixed(0)}%` : "未设置"}</span>,
                <select style={editSelect} value={editForm.taxRate != null ? editForm.taxRate : ""} onChange={(e) => { const val = e.target.value; updateField("taxRate", val === "" ? null : parseFloat(val)); }}>
                  <option value="">未设置</option>
                  {taxRateOptions.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                </select>,
              )}

              {renderField(
                "税额",
                <span style={fieldValue}>{invoice.taxAmount != null ? `¥${invoice.taxAmount.toFixed(2)}` : "未设置"}</span>,
                <input type="number" step="0.01" min="0" style={editInput} value={editForm.taxAmount ?? ""} onChange={(e) => { const val = e.target.value; updateField("taxAmount", val === "" ? null : parseFloat(val)); }} placeholder="未设置" />,
              )}

              {renderField(
                "价税合计",
                <span className="settings-meta" style={{ fontSize: 14, fontWeight: 700 }}>¥{invoice.totalAmount != null ? invoice.totalAmount.toFixed(2) : invoice.amount.toFixed(2)}</span>,
                <input type="number" step="0.01" min="0" style={editInput} value={editForm.totalAmount ?? ""} onChange={(e) => { const val = e.target.value; updateField("totalAmount", val === "" ? null : parseFloat(val)); }} placeholder="未设置" />,
              )}

              {invoice.totalAmount != null && (
                <div style={{ textAlign: "right", marginTop: 4, gridColumn: "1 / -1" }}>
                  <span style={{ fontSize: 12, color: "var(--c-d20f39)", fontWeight: 600 }}>{toChineseUpper(invoice.totalAmount)}</span>
                </div>
              )}
            </div>
          </div>

          {/* 3. 购买方信息 */}
          <div className="settings-card">
            <div style={sectionTitle}>购买方信息</div>
            <div style={grid2}>
              {renderField(
                "名称",
                <span style={fieldValue}>{invoice.buyerName ?? "未设置"}</span>,
                <input style={editInput} value={editForm.buyerName} onChange={(e) => updateField("buyerName", e.target.value)} placeholder="购买方名称" />,
              )}

              {renderField(
                "纳税人识别号",
                <span style={{ ...fieldValue, fontFamily: "monospace", fontSize: 12 }}>{invoice.buyerTaxId ?? "未设置"}</span>,
                <input style={editInput} value={editForm.buyerTaxId} onChange={(e) => updateField("buyerTaxId", e.target.value)} placeholder="纳税人识别号" />,
              )}
            </div>
          </div>

          {/* 4. 销售方信息 */}
          <div className="settings-card">
            <div style={sectionTitle}>销售方信息</div>
            <div style={grid2}>
              {renderField(
                "名称",
                <span style={fieldValue}>{invoice.sellerName ?? "未设置"}</span>,
                <input style={editInput} value={editForm.sellerName} onChange={(e) => updateField("sellerName", e.target.value)} placeholder="销售方名称" />,
              )}

              {renderField(
                "纳税人识别号",
                <span style={{ ...fieldValue, fontFamily: "monospace", fontSize: 12 }}>{invoice.sellerTaxId ?? "未设置"}</span>,
                <input style={editInput} value={editForm.sellerTaxId} onChange={(e) => updateField("sellerTaxId", e.target.value)} placeholder="纳税人识别号" />,
              )}
            </div>
          </div>

          {/* 5. 其他信息 */}
          <div className="settings-card">
            <div style={sectionTitle}>其他信息</div>
            <div style={grid2}>
              {invoice.orderId ? (
                <div style={fieldRow}>
                  <span style={fieldLabel}>关联订单</span>
                  <Link href={`/orders/${invoice.orderId}`} style={{ color: "var(--c-4a90e6)", fontSize: 13 }}>查看订单 <AppIcon name="chevron" className="inline-flow-arrow" /></Link>
                </div>
              ) : (
                <div style={fieldRow}>
                  <span style={fieldLabel}>关联订单</span>
                  <span style={fieldValue}>无</span>
                </div>
              )}
              {invoice.customerId ? (
                <div style={fieldRow}>
                  <span style={fieldLabel}>关联客户</span>
                  <Link href={`/customers/${invoice.customerId}`} style={{ color: "var(--c-4a90e6)", fontSize: 13 }}>查看客户 <AppIcon name="chevron" className="inline-flow-arrow" /></Link>
                </div>
              ) : (
                <div style={fieldRow}>
                  <span style={fieldLabel}>关联客户</span>
                  <span style={fieldValue}>无</span>
                </div>
              )}

              {/* dueDate / issuedAt shown in view mode when not editing */}
              {!isEditing && (<>
                <div style={fieldRow}>
                  <span style={fieldLabel}>到期日</span>
                  <span style={fieldValue}>{invoice.dueDate?.slice(0, 10) ?? "无"}</span>
                </div>
                <div style={fieldRow}>
                  <span style={fieldLabel}>开票日期</span>
                  <span style={fieldValue}>{invoice.issuedAt?.slice(0, 10) ?? "未开具"}</span>
                </div>
              </>)}

              {renderField(
                "备注",
                <span style={fieldValue}>{invoice.remark ?? "无"}</span>,
                <input style={editInput} value={editForm.remark} onChange={(e) => updateField("remark", e.target.value)} placeholder="备注" />,
              )}

              {renderField(
                "开票人",
                <span style={fieldValue}>{invoice.issuer ?? "未设置"}</span>,
                <input style={editInput} value={editForm.issuer} onChange={(e) => updateField("issuer", e.target.value)} placeholder="开票人" />,
              )}
            </div>
          </div>
        </div>
        <ConfirmDialog open={deleteOpen} title="删除草稿发票" message={`确定删除发票「${invoice.invoiceNumber ?? invoice.id}」吗？此操作不可撤销。`} loading={deleting} onConfirm={handleDelete} onCancel={() => setDeleteOpen(false)} />
        <ConfirmDialog open={Boolean(statusConfirm)} title="更新发票状态" message={statusConfirm === "cancelled" ? "确认作废这张发票吗？作废后不能恢复。" : "确认执行本次发票状态变更吗？"} confirmLabel="确认更新" loading={saving} onConfirm={handleStatusUpdate} onCancel={() => setStatusConfirm(null)} />
      </div>
    </div>
  );
}
