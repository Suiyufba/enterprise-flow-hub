import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  CreateDepartmentRequestSchema,
  CreateUserRequestSchema,
  UpdateDepartmentRequestSchema,
  UpdateUserRequestSchema,
} from "shared";
import {
  createDepartment,
  createUser,
  deleteDepartment,
  deleteUser,
  getUser,
  listDepartments,
  updateDepartment,
  updateUser,
} from "../store.js";

async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = request.headers["x-user-id"] as string | undefined;
  if (!userId) return reply.status(401).send({ error: "未登录" });
  const user = getUser(userId);
  if (!user) return reply.status(401).send({ error: "用户不存在" });
  if (user.role !== "admin") return reply.status(403).send({ error: "仅管理员可操作" });
}

export function enterpriseRoutes(app: FastifyInstance): void {
  // ---- Departments (read: anyone, write: admin) ----

  app.get("/departments", async (request) => {
    const { enterpriseId } = request.query as { enterpriseId?: string };
    if (!enterpriseId) return [];
    return listDepartments(enterpriseId);
  });

  app.post("/departments", { preHandler: [requireAdmin] }, async (request, reply) => {
    const parsed = CreateDepartmentRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const dept = createDepartment(parsed.data);
    return reply.status(201).send(dept);
  });

  app.patch("/departments/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateDepartmentRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const dept = updateDepartment(id, parsed.data);
    if (!dept) return reply.status(404).send({ error: "部门不存在" });
    return reply.send(dept);
  });

  app.delete("/departments/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = deleteDepartment(id);
    if (!ok) return reply.status(404).send({ error: "部门不存在" });
    return reply.status(204).send();
  });

  // ---- Admin User Management ----

  app.post("/users", { preHandler: [requireAdmin] }, async (request, reply) => {
    const parsed = CreateUserRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const user = createUser(parsed.data);
    if (!user) return reply.status(400).send({ error: "企业不存在或用户名已被使用" });
    return reply.status(201).send(user);
  });

  app.patch("/users/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateUserRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const user = updateUser(id, parsed.data);
    if (!user) return reply.status(404).send({ error: "用户不存在" });
    return reply.send(user);
  });
}
