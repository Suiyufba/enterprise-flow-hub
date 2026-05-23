import { z } from "zod";

// ---- Zod Schemas ----

export const AnalysisFieldSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: z.enum(["text", "number", "date", "enum", "ref", "boolean"]),
  options: z.array(z.string()).optional(),
  refEntity: z.string().optional(),
  missing: z.boolean().optional(),
});

export const AutomationRuleSchema = z.object({
  trigger: z.string(),
  condition: z.string(),
  action: z.string(),
});

export const AnalysisRequestSchema = z.object({
  need: z.string().min(1).max(500),
  businessType: z.string().optional(),
  tools: z.string().optional(),
  screenshotCount: z.number().int().min(1).max(8),
});

export const AnalysisResultSchema = z.object({
  id: z.string(),
  summary: z.string(),
  screenshotTypes: z.array(z.string()),
  businessObjects: z.array(z.string()),
  fields: z.array(AnalysisFieldSchema),
  workflowStages: z.array(z.string()),
  problems: z.array(z.string()),
  automationRules: z.array(AutomationRuleSchema),
  dashboardMetrics: z.array(z.string()),
  implementationPlan: z.array(z.string()),
  createdAt: z.string(),
});

// ---- TypeScript Types ----

export type AnalysisField = z.infer<typeof AnalysisFieldSchema>;
export type AutomationRule = z.infer<typeof AutomationRuleSchema>;
export type AnalysisRequest = z.infer<typeof AnalysisRequestSchema>;
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

// ---- Mock Data ----

export const MOCK_ANALYSIS: Omit<AnalysisResult, "id" | "createdAt"> = {
  summary:
    "This looks like a lead tracking spreadsheet for an education agency. The process has clear stages but is missing ownership tracking and follow-up mechanisms.",
  screenshotTypes: ["spreadsheet", "chat"],
  businessObjects: ["Lead", "Consultant", "FollowUpTask"],
  fields: [
    { name: "customerName", label: "Customer Name", type: "text" },
    {
      name: "stage",
      label: "Stage",
      type: "enum",
      options: ["new", "contacted", "quoted", "signed", "lost"],
    },
    { name: "consultant", label: "Assigned Consultant", type: "ref", refEntity: "Consultant" },
    { name: "nextFollowUp", label: "Next Follow-up", type: "date", missing: true },
  ],
  workflowStages: ["新线索", "已联系", "已报价", "已签约", "已流失"],
  problems: [
    "No next follow-up date field — leads can fall through cracks.",
    "Owner/consultant field is missing for several leads.",
  ],
  automationRules: [
    {
      trigger: "lead.created",
      condition: "no owner after 2 hours",
      action: "alert_manager",
    },
    {
      trigger: "lead.stage_changed",
      condition: "stage == quoted AND no follow-up after 3 days",
      action: "create_follow_up_task",
    },
  ],
  dashboardMetrics: ["new leads", "overdue follow-ups", "conversion rate"],
  implementationPlan: [
    "Create normalized lead table with required owner field.",
    "Add automated follow-up reminder rule.",
    "Build consultant daily status dashboard.",
  ],
};
