"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Invoice, InvoiceOcrCandidate } from "shared";
import { API, fetchJson, getStoredToken } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useToast } from "../lib/toast-context";
import { AppIcon } from "./AppIcon";
import { FormDialog } from "./FormDialog";

type CandidateForm = Omit<InvoiceOcrCandidate, "amount" | "taxRate" | "taxAmount" | "totalAmount"> & {
  amount: string;
  taxRate: string;
  taxAmount: string;
  totalAmount: string;
};

function toForm(candidate: InvoiceOcrCandidate): CandidateForm {
  return {
    ...candidate,
    amount: candidate.amount == null ? "" : String(candidate.amount),
    taxRate: candidate.taxRate == null ? "" : String(candidate.taxRate),
    taxAmount: candidate.taxAmount == null ? "" : String(candidate.taxAmount),
    totalAmount: candidate.totalAmount == null ? "" : String(candidate.totalAmount),
  };
}

function optionalText(value: string | null) {
  return value?.trim() || undefined;
}

function optionalNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export type InvoiceOcrUploaderHandle = {
  openPicker: () => void;
  processFile: (file: File) => void;
};

export const InvoiceOcrUploader = forwardRef<InvoiceOcrUploaderHandle, {
  enterpriseId?: string;
  projectId?: string;
  disabled?: boolean;
  buttonLabel?: string;
  buttonClassName?: string;
  onCreated?: (invoice: Invoice) => void | Promise<void>;
}>(function InvoiceOcrUploader({
  enterpriseId,
  projectId,
  disabled = false,
  buttonLabel = "识别发票",
  buttonClassName = "page-secondary-button",
  onCreated,
}, ref) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [candidate, setCandidate] = useState<CandidateForm | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [recognizing, setRecognizing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function update<K extends keyof CandidateForm>(key: K, value: CandidateForm[K]) {
    setCandidate((current) => current ? {
      ...current,
      [key]: value,
      ...((key === "invoiceNumber" || key === "invoiceCode") ? { duplicateInvoiceId: null } : {}),
    } : current);
  }

  async function handleFile(file?: File) {
    if (!file) return;
    if (!enterpriseId || !projectId) {
      showToast("请先选择发票所属的业务子类", "error");
      return;
    }
    if (!file.type.startsWith("image/")) {
      showToast("请选择 PNG、JPEG 或 WebP 图片", "error");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      showToast("发票图片不能超过 15MB", "error");
      return;
    }
    setRecognizing(true);
    try {
      const formData = new FormData();
      formData.append("relatedType", "project");
      formData.append("relatedId", projectId);
      formData.append("file", file);
      const headers: Record<string, string> = {};
      const token = getStoredToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      if (user?.id) headers["x-user-id"] = user.id;
      const uploadResponse = await fetch(`${API}/files/upload`, { method: "POST", headers, body: formData });
      if (!uploadResponse.ok) throw new Error(await uploadResponse.text());
      const uploaded = await uploadResponse.json() as { id: string };
      const recognized = await fetchJson<InvoiceOcrCandidate>(`/files/${uploaded.id}/ocr/invoice`, {
        method: "POST",
        adminUserId: user?.id,
      });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(file));
      setCandidate(toForm(recognized));
    } catch (error) {
      const message = error instanceof Error ? error.message : "发票识别失败";
      showToast(message.includes("error") ? "发票识别失败，请换一张清晰图片重试" : message, "error");
    } finally {
      setRecognizing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  useImperativeHandle(ref, () => ({
    openPicker: () => inputRef.current?.click(),
    processFile: (file: File) => { void handleFile(file); },
  }));

  async function confirmInvoice() {
    if (!candidate || !enterpriseId || !projectId) return;
    const amount = optionalNumber(candidate.amount);
    if (!amount || amount <= 0) {
      showToast("请核对并填写不含税金额", "error");
      return;
    }
    setSaving(true);
    try {
      const invoice = await fetchJson<Invoice>("/invoices", {
        method: "POST",
        adminUserId: user?.id,
        body: JSON.stringify({
          enterpriseId,
          projectId,
          sourceFileId: candidate.sourceFileId,
          amount,
          invoiceNumber: optionalText(candidate.invoiceNumber),
          invoiceCode: optionalText(candidate.invoiceCode),
          invoiceType: candidate.invoiceType ?? undefined,
          issuedAt: optionalText(candidate.issuedAt),
          taxRate: optionalNumber(candidate.taxRate),
          taxAmount: optionalNumber(candidate.taxAmount),
          totalAmount: optionalNumber(candidate.totalAmount),
          buyerName: optionalText(candidate.buyerName),
          buyerTaxId: optionalText(candidate.buyerTaxId),
          sellerName: optionalText(candidate.sellerName),
          sellerTaxId: optionalText(candidate.sellerTaxId),
          remark: optionalText(candidate.remark),
          issuer: optionalText(candidate.issuer),
        }),
      });
      setCandidate(null);
      showToast("发票已确认并保存为草稿", "success");
      await onCreated?.(invoice);
    } catch (error) {
      const message = error instanceof Error ? error.message : "发票保存失败";
      showToast(message.includes("已存在") ? "该发票已录入，请勿重复保存" : "发票保存失败，请检查字段后重试", "error");
    } finally {
      setSaving(false);
    }
  }

  const amountValid = candidate ? Number(candidate.amount) > 0 : false;

  return (
    <>
      <input
        ref={inputRef}
        className="invoice-ocr-input"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
      <button
        className={buttonClassName}
        type="button"
        disabled={disabled || recognizing || !enterpriseId || !projectId}
        onClick={() => inputRef.current?.click()}
        title={!projectId ? "请先选择业务子类" : "上传发票图片并识别"}
      >
        <AppIcon name="image" /> {recognizing ? "识别中..." : buttonLabel}
      </button>

      <FormDialog
        open={Boolean(candidate)}
        title="核对发票识别结果"
        saving={saving}
        className="invoice-ocr-dialog"
        submitLabel="确认并保存草稿"
        submitDisabled={!amountValid || Boolean(candidate?.duplicateInvoiceId)}
        onSubmit={() => void confirmInvoice()}
        onCancel={() => setCandidate(null)}
      >
        {candidate && (
          <div className="invoice-ocr-review">
            <section className="invoice-ocr-summary">
              <div>
                <strong>{candidate.filename}</strong>
                <span>{candidate.provider === "baidu-vat" ? "百度智能云增值税发票 OCR" : "服务器本地 OCR"}</span>
              </div>
              <span className="invoice-ocr-confidence">置信度 {Math.round(candidate.confidence * 100)}%</span>
            </section>

            {previewUrl && <img className="invoice-ocr-preview" src={previewUrl} alt="待核对的发票原图" />}

            {candidate.warnings.length > 0 && (
              <div className="invoice-ocr-warnings" role="alert">
                <AppIcon name="alert" />
                <div>{candidate.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>
              </div>
            )}

            <p className="invoice-ocr-notice">识别结果可能存在误差，请逐项核对。点击确认前不会创建发票记录。</p>

            <div className="invoice-ocr-fields">
              <label><span>发票号码</span><input className="page-input" value={candidate.invoiceNumber ?? ""} onChange={(event) => update("invoiceNumber", event.target.value)} /></label>
              <label><span>发票代码</span><input className="page-input" value={candidate.invoiceCode ?? ""} onChange={(event) => update("invoiceCode", event.target.value)} /></label>
              <label><span>发票类型</span><select className="page-input" value={candidate.invoiceType ?? ""} onChange={(event) => update("invoiceType", (event.target.value || null) as CandidateForm["invoiceType"])}><option value="">待确认</option><option value="vat_special">增值税专用发票</option><option value="vat_normal">增值税普通发票</option><option value="electronic">电子发票</option></select></label>
              <label><span>开票日期</span><input className="page-input" type="date" value={candidate.issuedAt?.slice(0, 10) ?? ""} onChange={(event) => update("issuedAt", event.target.value || null)} /></label>
              <label><span>不含税金额 *</span><input className="page-input" type="number" min="0" step="0.01" value={candidate.amount} onChange={(event) => update("amount", event.target.value)} /></label>
              <label><span>税额</span><input className="page-input" type="number" min="0" step="0.01" value={candidate.taxAmount} onChange={(event) => update("taxAmount", event.target.value)} /></label>
              <label><span>价税合计</span><input className="page-input" type="number" min="0" step="0.01" value={candidate.totalAmount} onChange={(event) => update("totalAmount", event.target.value)} /></label>
              <label><span>税率</span><select className="page-input" value={candidate.taxRate} onChange={(event) => update("taxRate", event.target.value)}><option value="">待确认</option><option value="0">0%</option><option value="0.01">1%</option><option value="0.03">3%</option><option value="0.06">6%</option><option value="0.09">9%</option><option value="0.13">13%</option></select></label>
              <label><span>购买方名称</span><input className="page-input" value={candidate.buyerName ?? ""} onChange={(event) => update("buyerName", event.target.value)} /></label>
              <label><span>购买方税号</span><input className="page-input" value={candidate.buyerTaxId ?? ""} onChange={(event) => update("buyerTaxId", event.target.value)} /></label>
              <label><span>销售方名称</span><input className="page-input" value={candidate.sellerName ?? ""} onChange={(event) => update("sellerName", event.target.value)} /></label>
              <label><span>销售方税号</span><input className="page-input" value={candidate.sellerTaxId ?? ""} onChange={(event) => update("sellerTaxId", event.target.value)} /></label>
              <label><span>开票人</span><input className="page-input" value={candidate.issuer ?? ""} onChange={(event) => update("issuer", event.target.value)} /></label>
              <label><span>备注</span><input className="page-input" value={candidate.remark ?? ""} onChange={(event) => update("remark", event.target.value)} /></label>
            </div>

            {candidate.lineItems.length > 0 && (
              <div className="invoice-ocr-lines">
                <h3>货物或服务明细</h3>
                <div className="invoice-ocr-table-wrap"><table><thead><tr><th>名称</th><th>数量</th><th>单价</th><th>金额</th><th>税额</th></tr></thead><tbody>{candidate.lineItems.map((item, index) => <tr key={`${item.name}-${index}`}><td>{item.name}</td><td>{item.quantity ?? "-"}</td><td>{item.unitPrice ?? "-"}</td><td>{item.amount ?? "-"}</td><td>{item.taxAmount ?? "-"}</td></tr>)}</tbody></table></div>
              </div>
            )}
          </div>
        )}
      </FormDialog>
    </>
  );
});
