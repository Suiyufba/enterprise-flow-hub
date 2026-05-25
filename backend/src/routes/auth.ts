import type { FastifyInstance } from "fastify";
import { RegisterUserRequestSchema, LoginRequestSchema } from "shared";
import { registerUser, loginUser, listUsers, getUser, deleteUser } from "../store.js";

export function authRoutes(app: FastifyInstance): void {
  // Register a new user
  app.post("/auth/register", async (request, reply) => {
    const body = RegisterUserRequestSchema.parse(request.body);
    const user = registerUser(body);
    if (!user) {
      return reply.status(409).send({ error: "用户名已存在或企业不存在" });
    }
    return reply.status(201).send(user);
  });

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
