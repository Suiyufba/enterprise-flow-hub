import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { listAuditLogs } from "../auth/audit.js";
import { requireAdminActor } from "./auth-context.js";

function getCallerEnterprise(request: FastifyRequest, reply: FastifyReply): string | null {
  const user = requireAdminActor(request, reply);
  return user?.enterpriseId ?? null;
}

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get("/audit", async (request, reply) => {
    const { enterpriseId, objectType, objectId, page, limit } = request.query as Record<string, string | undefined>;
    if (!enterpriseId) return { items: [], total: 0 };
    const actorEid = getCallerEnterprise(request, reply);
    if (!actorEid) return;
    return listAuditLogs(enterpriseId, { objectType, objectId, page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined });
  });
}
