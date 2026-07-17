import type { FastifyInstance } from "fastify";
import { LoginRequestSchema } from "shared";
import { loginUser, listUsers, getUser } from "../store.js";
import { createSession } from "../auth/service.js";
import { canAccessEnterprise, getRequestActor } from "./auth-context.js";

export function authRoutes(app: FastifyInstance): void {
  // Login
  app.post("/auth/login", async (request, reply) => {
    const parsed = LoginRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const user = loginUser(parsed.data);
    if (!user) {
      return reply.status(401).send({ error: "用户名或密码错误" });
    }
    const session = createSession(user.id);
    return reply.send({ ...user, token: session.token });
  });

  // Validate the current browser session
  app.get("/auth/me", async (request) => {
    const actor = (request as unknown as Record<string, unknown>).actor;
    return { user: actor ?? null };
  });

  // List users (optionally by enterprise)
  app.get("/users", async (request) => {
    const { enterpriseId } = request.query as { enterpriseId?: string };
    const actor = getRequestActor(request);
    if (!actor) return [];
    return listUsers(actor.role === "admin" ? enterpriseId : actor.enterpriseId);
  });

  // Get single user
  app.get("/users/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = getUser(id);
    if (!user) {
      return reply.status(404).send({ error: "用户不存在" });
    }
    if (!canAccessEnterprise(request, user.enterpriseId, reply)) return;
    return reply.send(user);
  });
}
