import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getUser } from "../store.js";
import { listAuditLogs } from "../auth/audit.js";

function getCallerEnterprise(request: FastifyRequest, reply: FastifyReply): string | null {
  const userId = request.headers["x-user-id"] as string | undefined;
  if (!userId) { reply.status(401).send({ error: "未登录" }); return null; }
  const user = getUser(userId);
  if (!user) { reply.status(401).send({ error: "用户不存在" }); return null; }
  if (user.role !== "admin") { reply.status(403).send({ error: "仅管理员可查看审计日志" }); return null; }
  return user.enterpriseId;
}

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get("/audit", async (request, reply) => {
    const { enterpriseId, objectType, objectId, page, limit } = request.query as Record<string, string | undefined>;
    if (!enterpriseId) return { items: [], total: 0 };
    const actorEid = getCallerEnterprise(request, reply);
    if (!actorEid) return;
    if (actorEid !== enterpriseId) return reply.status(403).send({ error: "无权查看" });
    return listAuditLogs(enterpriseId, { objectType, objectId, page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined });
  });
}
