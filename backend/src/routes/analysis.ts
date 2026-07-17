import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { AnalysisRequestSchema, type AnalysisResult } from "shared";
import { aiChat } from "../ai/client.js";
import { saveAnalysis, getAnalysis } from "../store.js";

export async function analysisRoutes(app: FastifyInstance) {
  app.post("/analysis", async (request, reply) => {
    const parseResult = AnalysisRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.flatten() });
    }
    const { need, businessType } = parseResult.data;

    let result: AnalysisResult;
    try {
      const aiResponse = await aiChat({
        systemPrompt: `你是企业流程诊断专家。分析用户描述的业务需求，输出 JSON 格式的诊断结果。
JSON 必须包含这些字段：
- summary: 一段中文总结
- screenshotTypes: 字符串数组（如 ["spreadsheet", "chat"]）
- businessObjects: 业务对象数组
- fields: 对象数组，每项有 name, label, type（text/number/date/enum/ref/boolean），可选 options, refEntity, missing
- workflowStages: 流程阶段数组
- problems: 发现的问题数组
- automationRules: 对象数组，每项有 trigger, condition, action
- dashboardMetrics: 建议指标数组
- implementationPlan: 实施步骤数组

只输出 JSON，不要有其他内容。`,
        userMessage: `业务类型：${businessType ?? "通用"}\n需求：${need}`,
        temperature: 0.3,
        maxTokens: 4096,
      });

      const parsed = JSON.parse(aiResponse.replace(/```json\n?|\n?```/g, "").trim());

      // Normalize: AI may return objects where strings are expected
      const str = (v: unknown): string =>
        typeof v === "string" ? v : (v != null && typeof v === "object" ? JSON.stringify(v, null, 2) : String(v ?? ""));
      const strs = (arr: unknown): string[] =>
        (Array.isArray(arr) ? arr : []).map(str);

      result = {
        id: randomUUID(),
        summary: str(parsed.summary) || `针对"${need}"的诊断分析`,
        screenshotTypes: strs(parsed.screenshotTypes),
        businessObjects: strs(parsed.businessObjects),
        fields: Array.isArray(parsed.fields) ? parsed.fields : [],
        workflowStages: strs(parsed.workflowStages),
        problems: strs(parsed.problems),
        automationRules: Array.isArray(parsed.automationRules) ? parsed.automationRules : [],
        dashboardMetrics: strs(parsed.dashboardMetrics),
        implementationPlan: strs(parsed.implementationPlan),
        createdAt: new Date().toISOString(),
      };
    } catch (e) {
      request.log.error({ err: e }, "AI analysis failed");
      return reply.status(502).send({
        error: "模型分析失败，请检查模型账号配置后重试。系统没有生成模拟结果。",
      });
    }

    saveAnalysis(result);
    return reply.status(201).send(result);
  });

  app.get("/analysis/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = getAnalysis(id);
    if (!result) {
      return reply.status(404).send({ error: "Analysis not found" });
    }
    return result;
  });
}
