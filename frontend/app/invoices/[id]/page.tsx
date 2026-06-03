"use client";

import { useEffect, useState, use, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { useToast } from "../../lib/toast-context";
import { StatusBadge } from "../../components/StatusBadge";
import { ErrorState } from "../../components/ErrorState";
import type { Invoice, PaginatedList } from "shared";

const statusLabels: Record<string, string> = {
  draft: "草稿", issued: "已开具", paid: "已付款", overdue: "已逾期", cancelled: "已取消",
};

const invoiceTypeLabels: Record<string, string> = {
  vat_special: "增值税专用发票",
  vat_normal: "增值税普通发票",
  electronic: "电子发票",
};

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

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  const enterpriseId = user?.enterpriseId ?? workspace.enterprises[0]?.id;
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvoice = useCallback(() => {
    if (!enterpriseId) { setError("未选择企业"); setLoading(false); return; }
    setError(null);
    setLoading(true);
    fetchJson<PaginatedList<Invoice>>(`/invoices?enterpriseId=${enterpriseId}&limit=1000`, { adminUserId: user?.id })
      .then((res) => {
        const found = res.items.find((i) => i.id === id);
        if (!found) { setInvoice(null); return; }
        setInvoice(found);
      })
      .catch(() => {
        setError("加载发票详情失败");
        showToast("加载发票信息失败", "error");
      })
      .finally(() => setLoading(false));
  }, [id, enterpriseId, user?.id, showToast]);

  useEffect(() => {
    fetchInvoice();
  }, [fetchInvoice]);

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
    marginRight: 16,
  };

  const fieldValue: React.CSSProperties = {
    fontSize: 13,
    color: "var(--c-c0c0c0)",
    textAlign: "right",
    wordBreak: "break-all",
  };

  return (
    <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
      <div className="page-shell">
        <div className="page-header">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button className="chat-back" onClick={() => router.push("/invoices")} type="button" aria-label="返回发票列表">←</button>
            <h1>发票详情</h1>
          </div>
        </div>

        <div className="settings-list">
          {/* 1. 基本信息 */}
          <div className="settings-card">
            <div style={sectionTitle}>基本信息</div>
            <div style={fieldRow}>
              <span style={fieldLabel}>编号</span>
              <span className="settings-meta" style={{ fontFamily: "monospace", fontSize: 12 }}>{invoice.id}</span>
            </div>
            <div style={fieldRow}>
              <span style={fieldLabel}>发票号码</span>
              <span style={fieldValue}>{invoice.invoiceNumber ?? "未设置"}</span>
            </div>
            <div style={fieldRow}>
              <span style={fieldLabel}>发票代码</span>
              <span style={fieldValue}>{invoice.invoiceCode ?? "未设置"}</span>
            </div>
            <div style={fieldRow}>
              <span style={fieldLabel}>发票类型</span>
              <span style={fieldValue}>{invoice.invoiceType ? invoiceTypeLabels[invoice.invoiceType] : "未设置"}</span>
            </div>
            <div style={fieldRow}>
              <span style={fieldLabel}>状态</span>
              <StatusBadge status={invoice.status} />
            </div>
            <div style={fieldRow}>
              <span style={fieldLabel}>创建时间</span>
              <span style={fieldValue}>{invoice.createdAt}</span>
            </div>
          </div>

          {/* 2. 金额信息 */}
          <div className="settings-card">
            <div style={sectionTitle}>金额信息</div>
            <div style={fieldRow}>
              <span style={fieldLabel}>金额（不含税）</span>
              <span className="settings-meta" style={{ fontSize: 14, fontWeight: 700 }}>¥{invoice.amount.toFixed(2)}</span>
            </div>
            <div style={fieldRow}>
              <span style={fieldLabel}>税率</span>
              <span style={fieldValue}>{invoice.taxRate != null ? `${(invoice.taxRate * 100).toFixed(0)}%` : "未设置"}</span>
            </div>
            <div style={fieldRow}>
              <span style={fieldLabel}>税额</span>
              <span style={fieldValue}>{invoice.taxAmount != null ? `¥${invoice.taxAmount.toFixed(2)}` : "未设置"}</span>
            </div>
            <div style={fieldRow}>
              <span style={fieldLabel}>价税合计</span>
              <span className="settings-meta" style={{ fontSize: 14, fontWeight: 700 }}>¥{invoice.totalAmount != null ? invoice.totalAmount.toFixed(2) : invoice.amount.toFixed(2)}</span>
            </div>
            {invoice.totalAmount != null && (
              <div style={{ textAlign: "right", marginTop: 4 }}>
                <span style={{ fontSize: 12, color: "var(--c-d20f39)", fontWeight: 600 }}>
                  {toChineseUpper(invoice.totalAmount)}
                </span>
              </div>
            )}
          </div>

          {/* 3. 购买方信息 */}
          <div className="settings-card">
            <div style={sectionTitle}>购买方信息</div>
            <div style={fieldRow}>
              <span style={fieldLabel}>名称</span>
              <span style={fieldValue}>{invoice.buyerName ?? "未设置"}</span>
            </div>
            <div style={fieldRow}>
              <span style={fieldLabel}>纳税人识别号</span>
              <span style={{ ...fieldValue, fontFamily: "monospace", fontSize: 12 }}>
                {invoice.buyerTaxId ?? "未设置"}
              </span>
            </div>
          </div>

          {/* 4. 销售方信息 */}
          <div className="settings-card">
            <div style={sectionTitle}>销售方信息</div>
            <div style={fieldRow}>
              <span style={fieldLabel}>名称</span>
              <span style={fieldValue}>{invoice.sellerName ?? "未设置"}</span>
            </div>
            <div style={fieldRow}>
              <span style={fieldLabel}>纳税人识别号</span>
              <span style={{ ...fieldValue, fontFamily: "monospace", fontSize: 12 }}>
                {invoice.sellerTaxId ?? "未设置"}
              </span>
            </div>
          </div>

          {/* 5. 其他信息 */}
          <div className="settings-card">
            <div style={sectionTitle}>其他信息</div>
            {invoice.orderId ? (
              <div style={fieldRow}>
                <span style={fieldLabel}>关联订单</span>
                <Link href={`/orders/${invoice.orderId}`} style={{ color: "var(--c-4a90e6)", fontSize: 13 }}>
                  查看订单 →
                </Link>
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
                <Link href={`/customers/${invoice.customerId}`} style={{ color: "var(--c-4a90e6)", fontSize: 13 }}>
                  查看客户 →
                </Link>
              </div>
            ) : (
              <div style={fieldRow}>
                <span style={fieldLabel}>关联客户</span>
                <span style={fieldValue}>无</span>
              </div>
            )}
            <div style={fieldRow}>
              <span style={fieldLabel}>到期日</span>
              <span style={fieldValue}>{invoice.dueDate?.slice(0, 10) ?? "无"}</span>
            </div>
            <div style={fieldRow}>
              <span style={fieldLabel}>开票日期</span>
              <span style={fieldValue}>{invoice.issuedAt?.slice(0, 10) ?? "未开具"}</span>
            </div>
            <div style={fieldRow}>
              <span style={fieldLabel}>备注</span>
              <span style={fieldValue}>{invoice.remark ?? "无"}</span>
            </div>
            <div style={fieldRow}>
              <span style={fieldLabel}>开票人</span>
              <span style={fieldValue}>{invoice.issuer ?? "未设置"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
