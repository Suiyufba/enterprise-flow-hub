import { createAutomation } from "../../store.js";
import { resolveProjectId } from "../../project-scope.js";

export async function automationExecute(input: Record<string, unknown>): Promise<string> {
  const enterpriseId = typeof input._enterpriseId === "string" ? input._enterpriseId : "";
  const requestedProjectId = typeof input._projectId === "string" ? input._projectId : (typeof input.projectId === "string" ? input.projectId : "");
  const name = typeof input.name === "string" ? input.name : "";
  const trigger = typeof input.trigger === "string" ? input.trigger : "";
  const triggerType = typeof input.triggerType === "string" &&
    ["schedule", "message", "webhook", "email", "file", "manual"].includes(input.triggerType)
    ? input.triggerType as "schedule" | "message" | "webhook" | "email" | "file" | "manual"
    : "schedule";
  const action = typeof input.action === "string" ? input.action : "";
  const actionType = typeof input.actionType === "string" &&
    ["call_ai", "notify", "tool_call"].includes(input.actionType)
    ? input.actionType as "call_ai" | "notify" | "tool_call"
    : "call_ai";
  const agentModel = typeof input.agentModel === "string" ? input.agentModel : undefined;
  const actionPluginId = typeof input.actionPluginId === "string" ? input.actionPluginId : undefined;
  const actionToolId = typeof input.actionToolId === "string" ? input.actionToolId : undefined;
  const actionInput = input.actionInput && typeof input.actionInput === "object" ? input.actionInput as Record<string, unknown> : undefined;
  const systemPrompt = typeof input.systemPrompt === "string" ? input.systemPrompt : undefined;

  if (!enterpriseId || !requestedProjectId || !name.trim() || !trigger.trim() || !action.trim()) {
    return JSON.stringify({
      error: "缺少必要参数",
      required: "enterpriseId, projectId, name, trigger, action",
      received: { enterpriseId, projectId: requestedProjectId, name, trigger, triggerType, action, actionType },
    });
  }

  try {
    const projectId = resolveProjectId(enterpriseId, requestedProjectId);
    const automation = createAutomation({
      projectId, name, trigger, triggerType, action, actionType,
      agentModel, actionPluginId, actionToolId, actionInput, systemPrompt,
    });
    if (!automation) {
      return JSON.stringify({ error: "创建失败，项目不存在" });
    }
    return JSON.stringify({
      ok: true,
      automation: {
        id: automation.id,
        name: automation.name,
        trigger: `${automation.triggerType}: ${automation.trigger}`,
        action: `${automation.actionType}: ${automation.action}`,
      },
      message: `已成功创建自动化规则「${automation.name}」`,
    });
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : "创建失败" });
  }
}
