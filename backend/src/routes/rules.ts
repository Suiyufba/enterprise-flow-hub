import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { listRules, getRule, createRule, setRuleEnabled, deleteRule, evaluateRulesForObject } from "../store/rules.js";
import { getCallerEnterprise } from "./auth-context.js";

export async function rulesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/rules", async (request, reply) => {
    const { enterpriseId } = request.query as Record<string, string | undefined>;
    if (!enterpriseId) return [];
    const actorEid = getCallerEnterprise(request, reply);
    if (!actorEid) return;
    if (actorEid !== enterpriseId) return reply.status(403).send({ error: "无权查看" });
    return listRules(enterpriseId);
  });

  app.post("/rules", async (request, reply) => {
    const { enterpriseId, name, description, objectType, triggerEvent, conditionExpr, actionType, actionConfig } = request.body as Record<string, unknown>;
    if (!enterpriseId || !name || !objectType || !triggerEvent || !actionType) {
      return reply.status(400).send({ error: "缺少必填字段" });
    }
    const actorEid = getCallerEnterprise(request, reply);
    if (!actorEid) return;
    if (enterpriseId !== actorEid) return reply.status(403).send({ error: "不能为其他企业创建规则" });
    const rule = createRule({
      enterpriseId: enterpriseId as string,
      name: name as string,
      description: description as string | undefined,
      objectType: objectType as string,
      triggerEvent: triggerEvent as string,
      conditionExpr: (conditionExpr as any) ?? { logic: "and", conditions: [] },
      actionType: actionType as any,
      actionConfig: actionConfig as Record<string, unknown> | undefined,
    });
    return reply.status(201).send(rule);
  });

  app.patch("/rules/:id/toggle", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getRule(id);
    if (!existing) return reply.status(404).send({ error: "规则不存在" });
    const actorEid = getCallerEnterprise(request, reply);
    if (!actorEid) return;
    if (existing.enterpriseId !== actorEid) return reply.status(403).send({ error: "无权操作" });
    const rule = setRuleEnabled(id, !existing.enabled);
    return reply.send(rule);
  });

  app.delete("/rules/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getRule(id);
    if (!existing) return reply.status(404).send({ error: "规则不存在" });
    const actorEid = getCallerEnterprise(request, reply);
    if (!actorEid) return;
    if (existing.enterpriseId !== actorEid) return reply.status(403).send({ error: "无权操作" });
    deleteRule(id);
    return reply.status(204).send();
  });

  app.post("/rules/test", async (request, reply) => {
    const { enterpriseId, objectType, objectData } = request.body as Record<string, unknown>;
    if (!enterpriseId || !objectType || !objectData) {
      return reply.status(400).send({ error: "缺少必填字段" });
    }
    const actorEid = getCallerEnterprise(request, reply);
    if (!actorEid) return;
    if (actorEid !== enterpriseId) return reply.status(403).send({ error: "无权操作其他企业数据" });
    return evaluateRulesForObject(objectType as string, objectData as Record<string, unknown>, enterpriseId as string);
  });
}
