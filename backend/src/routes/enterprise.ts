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
  getDepartment,
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
  // Attach authenticated user to request for downstream enterprise scoping
  (request as unknown as Record<string, unknown>).actor = user;
}

function ensureEnterpriseScope(request: FastifyRequest, targetEnterpriseId: string, reply: FastifyReply): boolean {
  const actor = (request as unknown as Record<string, unknown>).actor as { enterpriseId: string } | undefined;
  if (!actor || actor.enterpriseId !== targetEnterpriseId) {
    reply.status(403).send({ error: "无权操作其他企业的资源" });
    return false;
  }
  return true;
}

export function enterpriseRoutes(app: FastifyInstance): void {
  // ---- Departments (read: anyone, write: admin) ----

  app.get("/departments", async (request, reply) => {
    const { enterpriseId } = request.query as { enterpriseId?: string };
    if (!enterpriseId) return [];
    const userId = request.headers["x-user-id"] as string | undefined;
    if (userId) {
      const actor = getUser(userId);
      if (actor && actor.enterpriseId !== enterpriseId) {
        return reply.status(403).send({ error: "无权查看其他企业的数据" });
      }
    }
    return listDepartments(enterpriseId);
  });

  app.post("/departments", { preHandler: [requireAdmin] }, async (request, reply) => {
    const parsed = CreateDepartmentRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    if (!ensureEnterpriseScope(request, parsed.data.enterpriseId, reply)) return;
    const dept = createDepartment(parsed.data);
    return reply.status(201).send(dept);
  });

  app.patch("/departments/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getDepartment(id);
    if (!existing) return reply.status(404).send({ error: "部门不存在" });
    if (!ensureEnterpriseScope(request, existing.enterpriseId, reply)) return;
    const parsed = UpdateDepartmentRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const dept = updateDepartment(id, parsed.data);
    return reply.send(dept);
  });

  app.delete("/departments/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getDepartment(id);
    if (!existing) return reply.status(404).send({ error: "部门不存在" });
    if (!ensureEnterpriseScope(request, existing.enterpriseId, reply)) return;
    deleteDepartment(id);
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
    const existing = getUser(id);
    if (!existing) return reply.status(404).send({ error: "用户不存在" });
    if (!ensureEnterpriseScope(request, existing.enterpriseId, reply)) return;
    const parsed = UpdateUserRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const user = updateUser(id, parsed.data);
    return reply.send(user);
  });
}
