import type { FastifyInstance } from "fastify";
import { getAnalysis } from "../store.js";

function toMarkdown(a: NonNullable<ReturnType<typeof getAnalysis>>): string {
  return [
    `# Analysis Report`,
    ``,
    `> ${a.summary}`,
    ``,
    `## Screenshot Types`,
    ...a.screenshotTypes.map((t) => `- ${t}`),
    ``,
    `## Business Objects`,
    ...a.businessObjects.map((o) => `- ${o}`),
    ``,
    `## Fields`,
    ...a.fields.map(
      (f) =>
        `- **${f.name}** (${f.type}): ${f.label}${f.missing ? " ⚠ missing" : ""}`,
    ),
    ``,
    `## Workflow Stages`,
    a.workflowStages.join(" → "),
    ``,
    `## Problems`,
    ...a.problems.map((p) => `- ⚠ ${p}`),
    ``,
    `## Automation Rules`,
    ...a.automationRules.map(
      (r) => `- IF ${r.trigger} AND ${r.condition} → ${r.action}`,
    ),
    ``,
    `## Dashboard Metrics`,
    ...a.dashboardMetrics.map((m) => `- ${m}`),
    ``,
    `## Implementation Plan`,
    ...a.implementationPlan.map((s, i) => `${i + 1}. ${s}`),
    ``,
  ].join("\n");
}

export async function exportRoutes(app: FastifyInstance) {
  app.post("/analysis/:id/export", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { format } = request.body as { format: "markdown" | "json" };
    const analysis = getAnalysis(id);
    if (!analysis) {
      return reply.status(404).send({ error: "Analysis not found" });
    }
    if (format === "markdown") {
      return reply
        .header("Content-Type", "text/markdown; charset=utf-8")
        .send(toMarkdown(analysis));
    }
    return analysis;
  });
}
