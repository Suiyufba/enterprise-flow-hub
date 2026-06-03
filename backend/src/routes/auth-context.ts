import type { FastifyReply, FastifyRequest } from "fastify";
import type { User } from "shared";
import { getUser } from "../store.js";

type RequestWithActor = FastifyRequest & { actor?: User };

export function getRequestActor(request: FastifyRequest): User | null {
  const actor = (request as RequestWithActor).actor;
  if (actor) return actor;

  const userId = request.headers["x-user-id"] as string | undefined;
  return userId ? getUser(userId) ?? null : null;
}

export function requireRequestActor(request: FastifyRequest, reply: FastifyReply): User | null {
  const actor = getRequestActor(request);
  if (!actor) {
    reply.status(401).send({ error: "未登录" });
    return null;
  }
  return actor;
}

export function getCallerEnterprise(request: FastifyRequest, reply: FastifyReply): string | null {
  const actor = requireRequestActor(request, reply);
  return actor?.enterpriseId ?? null;
}

export function requireAdminActor(request: FastifyRequest, reply: FastifyReply): User | null {
  const actor = requireRequestActor(request, reply);
  if (!actor) return null;
  if (actor.role !== "admin") {
    reply.status(403).send({ error: "仅管理员可操作" });
    return null;
  }
  (request as RequestWithActor).actor = actor;
  return actor;
}
