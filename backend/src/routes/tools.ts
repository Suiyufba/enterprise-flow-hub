import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { RunToolRequestSchema, ToolDefinitionSchema } from "shared";
import { getTool, listRecentToolRuns, listTools, runTool, setToolStatus } from "../store.js";
import { getProject } from "../store.js";
import { canAccessEnterprise, getRequestActor, requireAdminActor } from "./auth-context.js";

async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  requireAdminActor(request, reply);
}

export async function toolRoutes(app: FastifyInstance) {
  app.get("/tools", async (request) => ({
    tools: listTools(),
    recentRuns: listRecentToolRuns(12, getRequestActor(request)?.role === "admin" ? undefined : getRequestActor(request)?.enterpriseId),
  }));

  app.get("/tools/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const tool = getTool(id);
    if (!tool) {
      return reply.status(404).send({ error: "Tool not found" });
    }
    return tool;
  });

  app.patch("/tools/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = ToolDefinitionSchema.pick({ status: true }).safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const tool = setToolStatus(id, parsed.data.status);
    if (!tool) {
      return reply.status(404).send({ error: "Tool not found" });
    }
    return tool;
  });

  app.post("/tools/:id/run", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = RunToolRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const actor = getRequestActor(request);
    if (!actor) return reply.status(401).send({ error: "未登录" });
    const requestedEnterpriseId = typeof parsed.data.input._enterpriseId === "string" ? parsed.data.input._enterpriseId : actor.enterpriseId;
    const enterpriseId = actor.role === "admin" ? requestedEnterpriseId : actor.enterpriseId;
    if (!canAccessEnterprise(request, enterpriseId, reply)) return;
    const projectId = typeof parsed.data.input._projectId === "string" ? parsed.data.input._projectId : "";
    if (projectId) {
      const project = getProject(projectId);
      if (!project || project.enterpriseId !== enterpriseId) {
        return reply.status(403).send({ error: "工具项目上下文不属于目标企业" });
      }
    }
    const result = await runTool(id, {
      ...parsed.data,
      input: { ...parsed.data.input, _enterpriseId: enterpriseId },
    });
    if (!result) {
      return reply.status(404).send({ error: "Tool not found" });
    }
    return reply.status(201).send(result);
  });
}
