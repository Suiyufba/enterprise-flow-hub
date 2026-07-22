import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import type { InvoiceOcrCandidate, InvoiceOcrLineItem } from "shared";
import { saveAnalysis } from "../store.js";
import { aiChat } from "./client.js";

const execFileAsync = promisify(execFile);
const BAIDU_TOKEN_URL = "https://aip.baidubce.com/oauth/2.0/token";
const BAIDU_VAT_URL = "https://aip.baidubce.com/rest/2.0/ocr/v1/vat_invoice";

let baiduTokenCache: { value: string; expiresAt: number } | null = null;
let localInvoiceOcrQueue: Promise<void> = Promise.resolve();

type CandidateFields = Omit<InvoiceOcrCandidate, "sourceFileId" | "filename" | "provider" | "confidence" | "warnings" | "duplicateInvoiceId">;

function textValue(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object" && "words" in value) {
    const words = (value as { words?: unknown }).words;
    return typeof words === "string" ? words.trim() || null : null;
  }
  return null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[,，￥¥\s]/g, "").replace(/[^\d.-]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function taxRateValue(value: unknown): number | null {
  const parsed = numberValue(value);
  if (parsed == null) return null;
  return parsed > 1 ? parsed / 100 : parsed;
}

function dateValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/(20\d{2})\D*(\d{1,2})\D*(\d{1,2})/);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function invoiceTypeValue(value: unknown, fallbackText = ""): CandidateFields["invoiceType"] {
  const sourceText = fallbackText.toLowerCase();
  if (/增值税[^\n]{0,12}专用发票|增值税专票/.test(sourceText)) return "vat_special";
  if (/增值税[^\n]{0,12}普通发票|增值税普票/.test(sourceText)) return "vat_normal";
  if (/电子[^\n]{0,12}发票|全电发票|数电发票/.test(sourceText)) return "electronic";
  const candidateValue = typeof value === "string" ? value : "";
  const onlyElectronicPaymentMarker = /电子支付标[识总]/.test(sourceText)
    && !/电子[^\n]{0,12}发票|全电发票|数电发票/.test(sourceText);
  const trustedValue = onlyElectronicPaymentMarker && /electronic|电子/.test(candidateValue.toLowerCase()) ? "" : candidateValue;
  const text = `${trustedValue} ${fallbackText.replace(/电子支付标[识总]/g, "")}`.toLowerCase();
  if (/专用|special/.test(text)) return "vat_special";
  if (/电子|electronic|digital/.test(text)) return "electronic";
  if (/普通|增值税|normal/.test(text)) return "vat_normal";
  return null;
}

function emptyFields(): CandidateFields {
  return {
    invoiceNumber: null,
    invoiceCode: null,
    invoiceType: null,
    issuedAt: null,
    amount: null,
    taxRate: null,
    taxAmount: null,
    totalAmount: null,
    buyerName: null,
    buyerTaxId: null,
    sellerName: null,
    sellerTaxId: null,
    remark: null,
    issuer: null,
    lineItems: [],
  };
}

function normalizeLineItems(value: unknown): InvoiceOcrLineItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).map((item) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      name: nullableString(row.name) ?? "未命名项目",
      specification: nullableString(row.specification),
      unit: nullableString(row.unit),
      quantity: numberValue(row.quantity),
      unitPrice: numberValue(row.unitPrice),
      amount: numberValue(row.amount),
      taxRate: taxRateValue(row.taxRate),
      taxAmount: numberValue(row.taxAmount),
    };
  });
}

function normalizeFields(raw: Record<string, unknown>, sourceText = ""): CandidateFields {
  const fields = emptyFields();
  fields.invoiceNumber = nullableString(raw.invoiceNumber);
  fields.invoiceCode = nullableString(raw.invoiceCode);
  fields.invoiceType = invoiceTypeValue(raw.invoiceType, sourceText);
  fields.issuedAt = dateValue(raw.issuedAt);
  fields.amount = numberValue(raw.amount);
  fields.taxRate = taxRateValue(raw.taxRate);
  fields.taxAmount = numberValue(raw.taxAmount);
  fields.totalAmount = numberValue(raw.totalAmount);
  fields.buyerName = nullableString(raw.buyerName);
  fields.buyerTaxId = nullableString(raw.buyerTaxId);
  fields.sellerName = nullableString(raw.sellerName);
  fields.sellerTaxId = nullableString(raw.sellerTaxId);
  fields.remark = nullableString(raw.remark);
  fields.issuer = nullableString(raw.issuer);
  fields.lineItems = normalizeLineItems(raw.lineItems);
  if (fields.amount == null && fields.totalAmount != null && fields.taxAmount != null) {
    fields.amount = Math.round((fields.totalAmount - fields.taxAmount) * 100) / 100;
  }
  return fields;
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function regexValue(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return null;
}

export function parseInvoiceText(rawText: string): CandidateFields {
  const fields = emptyFields();
  fields.invoiceNumber = regexValue(rawText, [/(?:发票号码|票据号码|No\.?)[：:\s]*([A-Z0-9-]{6,30})/i]);
  fields.invoiceCode = regexValue(rawText, [/(?:发票代码|票据代码)[：:\s]*([A-Z0-9-]{6,30})/i]);
  fields.issuedAt = dateValue(regexValue(rawText, [/(?:开票日期|日期)[：:\s]*([^\n]{6,24})/]));
  fields.buyerTaxId = regexValue(rawText, [/(?:购买方|购方)[\s\S]{0,180}?(?:纳税人识别号|统一社会信用代码)[：:\s]*([A-Z0-9]{12,24})/i]);
  fields.sellerTaxId = regexValue(rawText, [/(?:销售方|销方)[\s\S]{0,180}?(?:纳税人识别号|统一社会信用代码)[：:\s]*([A-Z0-9]{12,24})/i]);
  fields.totalAmount = numberValue(regexValue(rawText, [/(?:价税合计|小写)[^\d]{0,16}([¥￥]?\s*[\d,.]+(?:\.\d{1,2})?)/]));
  fields.taxAmount = numberValue(regexValue(rawText, [/(?:合计税额|税额合计)[^\d]{0,12}([¥￥]?\s*[\d,.]+(?:\.\d{1,2})?)/]));
  fields.amount = numberValue(regexValue(rawText, [/(?:合计金额|金额合计)[^\d]{0,12}([¥￥]?\s*[\d,.]+(?:\.\d{1,2})?)/]));
  fields.taxRate = taxRateValue(regexValue(rawText, [/(?:税率)[：:\s]*([\d.]+%?)/]));
  fields.invoiceType = invoiceTypeValue(null, rawText);
  if (fields.amount == null && fields.totalAmount != null && fields.taxAmount != null) {
    fields.amount = Math.round((fields.totalAmount - fields.taxAmount) * 100) / 100;
  }
  return fields;
}

async function parseInvoiceTextWithAi(rawText: string): Promise<CandidateFields> {
  const prompt = `从下面 OCR 原文提取中国发票字段，只返回一个 JSON 对象，不要解释，不得猜测原文不存在的值。
字段：invoiceNumber, invoiceCode, invoiceType(vat_special|vat_normal|electronic|null), issuedAt(YYYY-MM-DD), amount(不含税金额), taxRate(小数，如6%为0.06), taxAmount, totalAmount(价税合计), buyerName, buyerTaxId, sellerName, sellerTaxId, remark, issuer, lineItems。注意“电子支付标识”不是电子发票类型；票种标题无法辨认时 invoiceType 必须填 null。
lineItems 每项字段：name, specification, unit, quantity, unitPrice, amount, taxRate, taxAmount。无法确定填 null 或空数组。

OCR 原文：
${rawText.slice(0, 16000)}`;
  try {
    const result = await aiChat({
      systemPrompt: "你是严谨的中国发票字段抽取器。只依据输入原文输出 JSON。",
      userMessage: prompt,
      temperature: 0,
      maxTokens: 2200,
    });
    const parsed = extractJsonObject(result);
    return parsed ? normalizeFields(parsed, rawText) : parseInvoiceText(rawText);
  } catch {
    return parseInvoiceText(rawText);
  }
}

export async function extractImageText(storagePath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("tesseract", [
      storagePath,
      "stdout",
      "-l",
      process.env.TESSERACT_LANG ?? "chi_sim+eng",
      "--psm",
      "6",
    ], {
      timeout: 45_000,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, OMP_THREAD_LIMIT: process.env.OCR_THREAD_LIMIT ?? "1" },
    });
    return String(stdout).trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ENOENT")) throw new Error("服务器尚未安装 OCR 运行时");
    throw new Error(`本机 OCR 识别失败：${message.slice(0, 160)}`);
  }
}

async function runLocalInvoiceOcr(storagePath: string): Promise<CandidateFields> {
  const previous = localInvoiceOcrQueue;
  let release: () => void = () => undefined;
  localInvoiceOcrQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await parseInvoiceTextWithAi(await extractImageText(storagePath));
  } finally {
    release();
  }
}

async function baiduAccessToken(): Promise<string> {
  if (baiduTokenCache && baiduTokenCache.expiresAt > Date.now() + 60_000) return baiduTokenCache.value;
  const apiKey = process.env.BAIDU_OCR_API_KEY?.trim();
  const secretKey = process.env.BAIDU_OCR_SECRET_KEY?.trim();
  if (!apiKey || !secretKey) throw new Error("百度 OCR 未配置");
  const params = new URLSearchParams({ grant_type: "client_credentials", client_id: apiKey, client_secret: secretKey });
  const response = await fetch(`${BAIDU_TOKEN_URL}?${params}`, { method: "POST" });
  if (!response.ok) throw new Error(`百度 OCR 鉴权失败 (${response.status})`);
  const data = await response.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!data.access_token) throw new Error(data.error_description || "百度 OCR 鉴权失败");
  baiduTokenCache = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return data.access_token;
}

function baiduArray(words: Record<string, unknown>, key: string): unknown[] {
  const value = words[key];
  return Array.isArray(value) ? value : [];
}

function baiduPick(words: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = textValue(words[key]);
    if (value) return value;
  }
  return null;
}

function baiduLineItems(words: Record<string, unknown>): InvoiceOcrLineItem[] {
  const names = baiduArray(words, "CommodityName");
  const specs = baiduArray(words, "CommodityType");
  const units = baiduArray(words, "CommodityUnit");
  const quantities = baiduArray(words, "CommodityNum");
  const prices = baiduArray(words, "CommodityPrice");
  const amounts = baiduArray(words, "CommodityAmount");
  const rates = baiduArray(words, "CommodityTaxRate");
  const taxes = baiduArray(words, "CommodityTax");
  return names.slice(0, 50).map((name, index) => ({
    name: textValue(name) ?? "未命名项目",
    specification: textValue(specs[index]),
    unit: textValue(units[index]),
    quantity: numberValue(textValue(quantities[index])),
    unitPrice: numberValue(textValue(prices[index])),
    amount: numberValue(textValue(amounts[index])),
    taxRate: taxRateValue(textValue(rates[index])),
    taxAmount: numberValue(textValue(taxes[index])),
  }));
}

async function recognizeWithBaidu(storagePath: string): Promise<CandidateFields> {
  const token = await baiduAccessToken();
  const body = new URLSearchParams({ image: readFileSync(storagePath).toString("base64"), type: "normal" });
  const response = await fetch(`${BAIDU_VAT_URL}?access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await response.json() as { words_result?: Record<string, unknown>; error_msg?: string };
  if (!response.ok || !data.words_result) throw new Error(data.error_msg || `百度发票 OCR 失败 (${response.status})`);
  const words = data.words_result;
  return normalizeFields({
    invoiceNumber: baiduPick(words, "InvoiceNum", "InvoiceNumber"),
    invoiceCode: baiduPick(words, "InvoiceCode"),
    invoiceType: baiduPick(words, "InvoiceType", "InvoiceTypeOrg"),
    issuedAt: baiduPick(words, "InvoiceDate"),
    amount: baiduPick(words, "TotalAmount"),
    taxRate: baiduPick(words, "CommodityTaxRate"),
    taxAmount: baiduPick(words, "TotalTax"),
    totalAmount: baiduPick(words, "AmountInFiguers", "AmountInFigures"),
    buyerName: baiduPick(words, "PurchaserName"),
    buyerTaxId: baiduPick(words, "PurchaserRegisterNum"),
    sellerName: baiduPick(words, "SellerName"),
    sellerTaxId: baiduPick(words, "SellerRegisterNum"),
    remark: baiduPick(words, "Remarks"),
    issuer: baiduPick(words, "NoteDrawer", "Drawer"),
    lineItems: baiduLineItems(words),
  }, JSON.stringify(words));
}

function validationWarnings(fields: CandidateFields): string[] {
  const warnings: string[] = [];
  if (!fields.invoiceNumber) warnings.push("未可靠识别发票号码，请人工核对");
  if (!fields.issuedAt) warnings.push("未可靠识别开票日期");
  if (!fields.buyerName) warnings.push("未可靠识别购买方名称");
  if (!fields.sellerName) warnings.push("未可靠识别销售方名称");
  if (fields.amount == null || fields.amount <= 0) warnings.push("未可靠识别不含税金额");
  if (fields.totalAmount != null && fields.amount != null && fields.taxAmount != null) {
    const expected = Math.round((fields.amount + fields.taxAmount) * 100) / 100;
    if (Math.abs(expected - fields.totalAmount) > 0.02) warnings.push("金额与税额之和不等于价税合计");
  }
  return warnings;
}

function confidenceFor(fields: CandidateFields, provider: InvoiceOcrCandidate["provider"]): number {
  const checks = [fields.invoiceNumber, fields.issuedAt, fields.amount, fields.totalAmount, fields.buyerName, fields.sellerName];
  const completeness = checks.filter((value) => value != null && value !== "").length / checks.length;
  const base = provider === "baidu-vat" ? 0.72 : 0.42;
  return Math.min(0.99, Math.round((base + completeness * (provider === "baidu-vat" ? 0.25 : 0.4)) * 100) / 100);
}

export async function recognizeInvoiceFile(
  storagePath: string,
  mimeType: string,
  filename: string,
  sourceFileId: string,
): Promise<InvoiceOcrCandidate> {
  if (!mimeType.startsWith("image/")) throw new Error("发票识别仅支持图片文件");
  const useBaidu = Boolean(process.env.BAIDU_OCR_API_KEY?.trim() && process.env.BAIDU_OCR_SECRET_KEY?.trim());
  const provider: InvoiceOcrCandidate["provider"] = useBaidu ? "baidu-vat" : "tesseract";
  const fields = useBaidu
    ? await recognizeWithBaidu(storagePath)
    : await runLocalInvoiceOcr(storagePath);
  return {
    sourceFileId,
    filename,
    provider,
    confidence: confidenceFor(fields, provider),
    ...fields,
    warnings: validationWarnings(fields),
    duplicateInvoiceId: null,
  };
}

export async function analyzeImageFile(
  storagePath: string,
  mimeType: string,
  filename: string,
): Promise<{ summary: string; fields: Array<{ name: string; label: string; type: string }> } | null> {
  if (!mimeType.startsWith("image/")) return null;
  try {
    const rawText = await extractImageText(storagePath);
    if (!rawText) return null;
    const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const fields = lines.slice(0, 80).map((line, index) => ({ name: `line_${index + 1}`, label: line.slice(0, 120), type: "text" }));
    const summary = lines.join(" ").slice(0, 200);
    saveAnalysis({
      id: `analysis-${randomUUID()}`,
      summary,
      screenshotTypes: [],
      businessObjects: [],
      fields,
      workflowStages: [],
      problems: [],
      automationRules: [],
      dashboardMetrics: [],
      implementationPlan: [],
      createdAt: new Date().toISOString(),
    } as unknown as Parameters<typeof saveAnalysis>[0]);
    return { summary, fields };
  } catch {
    return null;
  }
}
