import { readFileSync } from "node:fs";
import { aiChat } from "./client.js";
import { saveAnalysis } from "../store.js";
import { randomUUID } from "node:crypto";

export async function analyzeImageFile(
  storagePath: string,
  mimeType: string,
  filename: string,
): Promise<{ summary: string; fields: Array<{ name: string; label: string; type: string }> } | null> {
  if (!mimeType.startsWith("image/")) return null;

  try {
    const buffer = readFileSync(storagePath);
    const base64 = buffer.toString("base64");

    const result = await aiChat({
      systemPrompt: `你是文档OCR识别助手。分析上传的截图/图片，提取其中的文字信息和业务数据。
输出格式：先写一段简短摘要（50字以内），然后列出识别到的关键字段（如姓名、金额、日期、订单号等），每行一个，格式为"字段名: 值"。
如果图片中没有文字或无法识别，回复"无法识别"。`,
      userMessage: `请识别并提取这张图片 "${filename}" 中的文字和结构化信息。`,
      temperature: 0.3,
      maxTokens: 1024,
    });

    if (!result || result.includes("无法识别")) return null;

    // Extract fields as AnalysisField objects
    const rawLines = result.split("\n").filter((l) => l.includes(":"));
    const fields = rawLines.map((l) => {
      const [name, ...rest] = l.split(":");
      const label = name.trim();
      return { name: label, label, type: "text" as const };
    });

    // Save to existing analysis_results table
    const id = `analysis-${randomUUID()}`;
    // Cast through unknown — shared package types may be stale but data shape is correct
    saveAnalysis({
      id,
      summary: result.slice(0, 200),
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

    return { summary: result.slice(0, 200), fields };
  } catch (e) {
    console.error(`[OCR] Failed for ${filename}:`, e instanceof Error ? e.message : e);
    return null;
  }
}
