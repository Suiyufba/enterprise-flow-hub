import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { listRules, getRule, createRule, updateRule, setRuleEnabled, deleteRule, evaluateRulesForObject } from "../store/rules.js";
import { canAccessEnterprise } from "./auth-context.js";
import { getAutomation, getProject, listConfiguredNotificationPlugins } from "../store.js";

export async function rulesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/rules", async (request, reply) => {
    const { enterpriseId } = request.query as Record<string, string | undefined>;
    if (!enterpriseId) return [];
    if (!canAccessEnterprise(request, enterpriseId, reply)) return;
    return listRules(enterpriseId);
  });

  app.post("/rules", async (request, reply) => {
    const { enterpriseId, name, description, objectType, triggerEvent, conditionExpr, actionType, actionConfig } = request.body as Record<string, unknown>;
    if (!enterpriseId || !name || !objectType || !triggerEvent || !actionType) {
      return reply.status(400).send({ error: "缺少必填字段" });
    }
    const allowedObjects = new Set(["customer", "supplier", "product", "order", "payment", "invoice", "file", "project"]);
    const allowedEvents = new Set(["create", "update", "delete", "status_change"]);
    const allowedActions = new Set(["notify", "set_field", "create_task", "trigger_approval", "trigger_automation"]);
    if (!allowedObjects.has(objectType as string) || !allowedEvents.has(triggerEvent as string) || !allowedActions.has(actionType as string)) {
      return reply.status(400).send({ error: "对象、事件或动作类型不受支持" });
    }
    if (!canAccessEnterprise(request, enterpriseId as string, reply)) return;
    const config = actionConfig && typeof actionConfig === "object" ? actionConfig as Record<string, unknown> : {};
    const tableByObject: Record<string, string> = {
      customer: "customers", order: "orders", payment: "payments", invoice: "invoices",
    };
    if (actionType === "set_field") {
      const statusValues: Record<string, string[]> = {
        customer: ["active", "inactive", "lead", "lost"],
        order: ["draft", "confirmed", "processing", "shipped", "delivered", "cancelled"],
        payment: ["pending", "completed", "failed", "refunded"],
        invoice: ["draft", "issued", "paid", "overdue", "cancelled"],
      };
      const values = statusValues[objectType as string];
      if (config.table !== tableByObject[objectType as string] || config.field !== "status" || !values?.includes(config.value as string)) {
        return reply.status(400).send({ error: "该对象不支持这个状态值" });
      }
    }
    if (actionType === "notify") {
      const pluginId = typeof config.pluginId === "string" ? config.pluginId : "";
      if (!listConfiguredNotificationPlugins().some((plugin) => plugin.id === pluginId)) {
        return reply.status(400).send({ error: "通知动作需要已绑定并启用的飞书或企业微信插件" });
      }
    }
    if (actionType === "trigger_automation") {
      const automationId = typeof config.automationId === "string" ? config.automationId : "";
      const automation = getAutomation(automationId);
      const project = automation ? getProject(automation.projectId) : undefined;
      if (!automation || !project || project.enterpriseId !== enterpriseId) {
        return reply.status(400).send({ error: "关联自动化不存在或不属于当前企业" });
      }
    }
    const rule = createRule({
      enterpriseId: enterpriseId as string,
      name: name as string,
      description: description as string | undefined,
      objectType: objectType as string,
      triggerEvent: triggerEvent as string,
      conditionExpr: (conditionExpr as any) ?? { logic: "and", conditions: [] },
      actionType: actionType as any,
      actionConfig: config,
    });
    return reply.status(201).send(rule);
  });

  app.patch("/rules/:id/toggle", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getRule(id);
    if (!existing) return reply.status(404).send({ error: "规则不存在" });
    if (!canAccessEnterprise(request, existing.enterpriseId, reply)) return;
    const rule = setRuleEnabled(id, !existing.enabled);
    return reply.send(rule);
  });

  app.patch("/rules/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getRule(id);
    if (!existing) return reply.status(404).send({ error: "规则不存在" });
    if (!canAccessEnterprise(request, existing.enterpriseId, reply)) return;
    const body = request.body as Record<string, unknown>;
    const name = body.name === undefined ? existing.name : String(body.name).trim();
    const objectType = body.objectType === undefined ? existing.objectType : String(body.objectType);
    const triggerEvent = body.triggerEvent === undefined ? existing.triggerEvent : String(body.triggerEvent);
    const actionType = body.actionType === undefined ? existing.actionType : String(body.actionType);
    const actionConfig = body.actionConfig && typeof body.actionConfig === "object"
      ? body.actionConfig as Record<string, unknown>
      : existing.actionConfig;
    if (!name) return reply.status(400).send({ error: "规则名称不能为空" });
    const allowedObjects = new Set(["customer", "supplier", "product", "order", "payment", "invoice", "file", "project"]);
    const allowedEvents = new Set(["create", "update", "delete", "status_change"]);
    const allowedActions = new Set(["notify", "set_field", "create_task", "trigger_approval", "trigger_automation"]);
    if (!allowedObjects.has(objectType) || !allowedEvents.has(triggerEvent) || !allowedActions.has(actionType)) {
      return reply.status(400).send({ error: "对象、事件或动作类型不受支持" });
    }
    if (actionType === "notify") {
      const pluginId = typeof actionConfig.pluginId === "string" ? actionConfig.pluginId : "";
      if (!listConfiguredNotificationPlugins().some((plugin) => plugin.id === pluginId)) {
        return reply.status(400).send({ error: "通知动作需要已绑定并启用的飞书或企业微信插件" });
      }
    }
    if (actionType === "set_field") {
      const tableByObject: Record<string, string> = { customer: "customers", order: "orders", payment: "payments", invoice: "invoices" };
      const statusValues: Record<string, string[]> = {
        customer: ["active", "inactive", "lead", "lost"],
        order: ["draft", "confirmed", "processing", "shipped", "delivered", "cancelled"],
        payment: ["pending", "completed", "failed", "refunded"],
        invoice: ["draft", "issued", "paid", "overdue", "cancelled"],
      };
      if (actionConfig.table !== tableByObject[objectType] || actionConfig.field !== "status" || !statusValues[objectType]?.includes(actionConfig.value as string)) {
        return reply.status(400).send({ error: "该对象不支持这个状态值" });
      }
    }
    if (actionType === "trigger_automation") {
      const automationId = typeof actionConfig.automationId === "string" ? actionConfig.automationId : "";
      const automation = getAutomation(automationId);
      const project = automation ? getProject(automation.projectId) : undefined;
      if (!automation || !project || project.enterpriseId !== existing.enterpriseId) {
        return reply.status(400).send({ error: "关联自动化不存在或不属于当前企业" });
      }
    }
    const rule = updateRule(id, {
      name,
      description: body.description === undefined ? existing.description : String(body.description),
      objectType,
      triggerEvent,
      conditionExpr: body.conditionExpr && typeof body.conditionExpr === "object" ? body.conditionExpr as any : existing.conditionExpr,
      actionType: actionType as typeof existing.actionType,
      actionConfig,
    });
    return reply.send(rule);
  });

  app.delete("/rules/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getRule(id);
    if (!existing) return reply.status(404).send({ error: "规则不存在" });
    if (!canAccessEnterprise(request, existing.enterpriseId, reply)) return;
    deleteRule(id);
    return reply.status(204).send();
  });

  app.post("/rules/test", async (request, reply) => {
    const { enterpriseId, objectType, objectData } = request.body as Record<string, unknown>;
    if (!enterpriseId || !objectType || !objectData) {
      return reply.status(400).send({ error: "缺少必填字段" });
    }
    if (!canAccessEnterprise(request, enterpriseId as string, reply)) return;
    return evaluateRulesForObject(objectType as string, objectData as Record<string, unknown>, enterpriseId as string);
  });
}
