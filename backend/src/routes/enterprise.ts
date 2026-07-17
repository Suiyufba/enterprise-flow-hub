import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  CreateDepartmentRequestSchema,
  CreateUserRequestSchema,
  UpdateDepartmentRequestSchema,
  UpdateEnterpriseRequestSchema,
  UpdateUserRequestSchema,
} from "shared";
import {
  createDepartment,
  createUser,
  deleteDepartment,
  deleteUser,
  getDepartment,
  getEnterprise,
  getUser,
  listDepartments,
  updateDepartment,
  updateEnterprise,
  updateUser,
} from "../store.js";
import { canAccessEnterprise, getRequestActor, requireAdminActor } from "./auth-context.js";

async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const actor = requireAdminActor(request, reply);
  if (!actor) return reply;
}

function ensureEnterpriseScope(request: FastifyRequest, targetEnterpriseId: string, reply: FastifyReply): boolean {
  return canAccessEnterprise(request, targetEnterpriseId, reply);
}

export function enterpriseRoutes(app: FastifyInstance): void {
  app.patch("/enterprises/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getEnterprise(id);
    if (!existing) return reply.status(404).send({ error: "企业不存在" });
    if (!ensureEnterpriseScope(request, existing.id, reply)) return;
    const parsed = UpdateEnterpriseRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    return reply.send(updateEnterprise(id, parsed.data));
  });

  // ---- Departments (read: anyone, write: admin) ----

  app.get("/departments", async (request, reply) => {
    const { enterpriseId } = request.query as { enterpriseId?: string };
    if (!enterpriseId) return [];
    const actor = getRequestActor(request);
    if (actor && actor.role !== "admin" && actor.enterpriseId !== enterpriseId) {
      return reply.status(403).send({ error: "无权查看其他企业的数据" });
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
    if (!ensureEnterpriseScope(request, parsed.data.enterpriseId, reply)) return;
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

  app.delete("/users/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const actor = getRequestActor(request);
    if (actor?.id === id) return reply.status(400).send({ error: "不能删除当前登录账号" });
    const existing = getUser(id);
    if (!existing) return reply.status(404).send({ error: "用户不存在" });
    if (!ensureEnterpriseScope(request, existing.enterpriseId, reply)) return;
    deleteUser(id);
    return reply.status(204).send();
  });
}
