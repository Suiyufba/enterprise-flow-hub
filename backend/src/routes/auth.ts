import type { FastifyInstance } from "fastify";
import { LoginRequestSchema } from "shared";
import { loginUser, listUsers, getUser, deleteUser } from "../store.js";

export function authRoutes(app: FastifyInstance): void {
  // Login
  app.post("/auth/login", async (request, reply) => {
    const body = LoginRequestSchema.parse(request.body);
    const user = loginUser(body);
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

  // Delete user
  app.delete("/users/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = deleteUser(id);
    if (!ok) {
      return reply.status(404).send({ error: "用户不存在" });
    }
    return reply.status(204).send();
  });
}
