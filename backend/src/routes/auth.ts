import type { FastifyInstance } from "fastify";
import { LoginRequestSchema } from "shared";
import { loginUser, listUsers, getUser, deleteUser } from "../store.js";

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
    return reply.send(user);
  });

  // List users (optionally by enterprise)
  app.get("/users", async (request) => {
    const { enterpriseId } = request.query as { enterpriseId?: string };
    return listUsers(enterpriseId);
  });

  // Get single user
  app.get("/users/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = getUser(id);
    if (!user) {
      return reply.status(404).send({ error: "用户不存在" });
    }
    return reply.send(user);
  });

  // Delete user (admin only)
  app.delete("/users/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = (request.headers["x-user-id"] as string | undefined);
    if (!userId) return reply.status(401).send({ error: "未登录" });
    const actor = getUser(userId);
    if (!actor || actor.role !== "admin") return reply.status(403).send({ error: "仅管理员可操作" });
    const ok = deleteUser(id);
    if (!ok) {
      return reply.status(404).send({ error: "用户不存在" });
    }
    return reply.status(204).send();
  });
}
