import type { FastifyInstance } from "fastify";
import {
  AddMessageRequestSchema,
  CreateAutomationRequestSchema,
  CreateConversationRequestSchema,
  CreateLibraryItemRequestSchema,
  CreateProjectRequestSchema,
  PluginConfigRequestSchema,
  CreateSkillRequestSchema,
  UpdateConversationRequestSchema,
  UpdateLibraryItemRequestSchema,
  UpdateProjectRequestSchema,
  UpdateSkillRequestSchema,
} from "shared";
import {
  addMessage,
  createAutomation,
  createConversation,
  createLibraryItem,
  createProject,
  createSkill,
  deleteAutomation,
  deleteConversation,
  deleteLibraryItem,
  deleteProject,
  deleteSkill,
  getAutomation,
  getConversation,
  getPluginConfig,
  getProject,
  getWorkspace,
  setAutomationEnabled,
  setPluginEnabled,
  updateAutomation,
  updateConversation,
  updateLibraryItem,
  updatePluginConfig,
  updateProject,
  updateSkill,
} from "../store.js";
import { runAutomationNow, triggerProjectAutomations } from "../automation/scheduler.js";

export async function workspaceRoutes(app: FastifyInstance) {
  app.get("/workspace", async () => getWorkspace());

  app.get("/projects/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const workspace = getWorkspace();
    const project = getProject(id);
    if (!project) {
      return reply.status(404).send({ error: "Project not found" });
    }
    return {
      project,
      enterprise: workspace.enterprises.find((item) => item.id === project.enterpriseId),
      conversations: workspace.conversations.filter((item) => item.projectId === id),
      libraryItems: workspace.libraryItems.filter((item) => item.projectId === id),
      automations: workspace.automations.filter((item) => item.projectId === id),
    };
  });

  app.post("/projects", async (request, reply) => {
    const parsed = CreateProjectRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    return reply.status(201).send(createProject(parsed.data));
  });

  app.patch("/projects/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateProjectRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const project = updateProject(id, parsed.data);
    if (!project) {
      return reply.status(404).send({ error: "Project not found" });
    }
    return project;
  });

  app.delete("/projects/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = deleteProject(id);
    if (!ok) {
      return reply.status(404).send({ error: "Project not found" });
    }
    return reply.status(204).send();
  });

  app.post("/library", async (request, reply) => {
    const parsed = CreateLibraryItemRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const item = createLibraryItem(parsed.data);
    if (!item) {
      return reply.status(404).send({ error: "Project not found" });
    }
    return reply.status(201).send(item);
  });

  app.patch("/library/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateLibraryItemRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const item = updateLibraryItem(id, parsed.data);
    if (!item) {
      return reply.status(404).send({ error: "Library item not found" });
    }
    return item;
  });

  app.delete("/library/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = deleteLibraryItem(id);
    if (!ok) {
      return reply.status(404).send({ error: "Library item not found" });
    }
    return reply.status(204).send();
  });

  app.patch("/plugins/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { enabled } = request.body as { enabled?: boolean };
    if (typeof enabled !== "boolean") {
      return reply.status(400).send({ error: "enabled must be boolean" });
    }
    let plugin;
    try {
      plugin = setPluginEnabled(id, enabled);
    } catch (e) {
      return reply.status(400).send({ error: e instanceof Error ? e.message : "Plugin requires configuration before enabling" });
    }
    if (!plugin) {
      return reply.status(404).send({ error: "Plugin not found" });
    }
    return plugin;
  });

  app.get("/plugins/:id/config", async (request, reply) => {
    const { id } = request.params as { id: string };
    const config = getPluginConfig(id);
    if (!config) {
      return reply.status(404).send({ error: "Plugin not found" });
    }
    return config;
  });

  app.patch("/plugins/:id/config", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = PluginConfigRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const config = updatePluginConfig(id, parsed.data.fields);
    if (!config) {
      return reply.status(404).send({ error: "Plugin not found" });
    }
    return config;
  });

  app.post("/automations", async (request, reply) => {
    const parsed = CreateAutomationRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    let automation;
    try {
      automation = createAutomation(parsed.data);
    } catch (e) {
      return reply.status(400).send({ error: e instanceof Error ? e.message : "Automation is not ready" });
    }
    if (!automation) {
      return reply.status(404).send({ error: "Project not found" });
    }
    return reply.status(201).send(automation);
  });

  app.patch("/automations/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    // Toggle-only mode (backwards compatible)
    if (typeof body.enabled === "boolean" && Object.keys(body).length === 1) {
      const automation = setAutomationEnabled(id, body.enabled);
      if (!automation) return reply.status(404).send({ error: "Automation not found" });
      return automation;
    }
    // Full update mode
    const parsed = CreateAutomationRequestSchema.partial().safeParse(body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    let automation;
    try {
      automation = updateAutomation(id, parsed.data);
    } catch (e) {
      return reply.status(400).send({ error: e instanceof Error ? e.message : "Automation is not ready" });
    }
    if (!automation) return reply.status(404).send({ error: "Automation not found" });
    return automation;
  });

  app.post("/automations/:id/run", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const automation = await runAutomationNow(id, { source: "manual", body: request.body ?? {} }, app.log);
      if (!automation) return reply.status(404).send({ error: "Automation not found or disabled" });
      return automation;
    } catch (e) {
      return reply.status(500).send({ error: e instanceof Error ? e.message : "Automation run failed" });
    }
  });

  app.post("/automations/:id/webhook", async (request, reply) => {
    const { id } = request.params as { id: string };
    const current = getAutomation(id);
    if (!current) return reply.status(404).send({ error: "Automation not found" });
    if (current.triggerType !== "webhook") {
      return reply.status(400).send({ error: "Automation is not a webhook trigger" });
    }
    try {
      const automation = await runAutomationNow(id, { source: "webhook", body: request.body ?? {} }, app.log);
      if (!automation) return reply.status(400).send({ error: "Automation is disabled" });
      return { ok: true, automation };
    } catch (e) {
      return reply.status(500).send({ error: e instanceof Error ? e.message : "Webhook automation failed" });
    }
  });

  app.post("/automations/:id/events/:type", async (request, reply) => {
    const { id, type } = request.params as { id: string; type: string };
    if (!["email", "file"].includes(type)) {
      return reply.status(400).send({ error: "Unsupported event type" });
    }
    const current = getAutomation(id);
    if (!current) return reply.status(404).send({ error: "Automation not found" });
    if (current.triggerType !== type) {
      return reply.status(400).send({ error: `Automation is not a ${type} trigger` });
    }
    try {
      const automation = await runAutomationNow(id, { source: type, body: request.body ?? {} }, app.log);
      if (!automation) return reply.status(400).send({ error: "Automation is disabled" });
      return { ok: true, automation };
    } catch (e) {
      return reply.status(500).send({ error: e instanceof Error ? e.message : "Event automation failed" });
    }
  });

  app.delete("/automations/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = deleteAutomation(id);
    if (!ok) {
      return reply.status(404).send({ error: "Automation not found" });
    }
    return reply.status(204).send();
  });

  app.get("/conversations/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const detail = getConversation(id);
    if (!detail) {
      return reply.status(404).send({ error: "Conversation not found" });
    }
    return detail;
  });

  app.patch("/conversations/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateConversationRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const detail = updateConversation(id, parsed.data);
    if (!detail) {
      return reply.status(404).send({ error: "Conversation not found" });
    }
    return detail;
  });

  app.post("/conversations", async (request, reply) => {
    const parsed = CreateConversationRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const detail = createConversation(parsed.data);
    if (!detail) {
      return reply.status(400).send({ error: "Project does not belong to enterprise" });
    }
    return reply.status(201).send(detail);
  });

  app.post("/skills", async (request, reply) => {
    const parsed = CreateSkillRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    return reply.status(201).send(createSkill(parsed.data));
  });

  app.patch("/skills/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateSkillRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const skill = updateSkill(id, parsed.data);
    if (!skill) {
      return reply.status(404).send({ error: "Skill not found" });
    }
    return skill;
  });

  app.delete("/skills/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = deleteSkill(id);
    if (!ok) {
      return reply.status(404).send({ error: "Skill not found" });
    }
    return reply.status(204).send();
  });

  app.delete("/conversations/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = deleteConversation(id);
    if (!ok) {
      return reply.status(404).send({ error: "Conversation not found" });
    }
    return reply.status(204).send();
  });

  app.post("/conversations/:id/messages", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = AddMessageRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    try {
      const before = getConversation(id);
      const result = await addMessage(id, parsed.data);
      if (!result) {
        return reply.status(404).send({ error: "Conversation not found" });
      }
      if (before) {
        void triggerProjectAutomations(
          "message",
          before.projectId,
          { source: "message", conversationId: id, content: parsed.data.content },
          app.log,
        );
      }
      return reply.status(201).send(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith("NO_PROVIDER:")) {
        return reply.status(400).send({ error: msg.slice("NO_PROVIDER:".length).trim() });
      }
      if (msg.includes("401") || msg.includes("403")) {
        return reply.status(502).send({ error: "AI 模型认证失败，请检查 API Key 是否正确", detail: msg });
      }
      if (msg.includes("timeout") || msg.includes("ETIMEDOUT")) {
        return reply.status(502).send({ error: "AI 服务响应超时，请稍后重试", detail: msg });
      }
      return reply.status(502).send({ error: "AI 处理失败，请稍后重试", detail: msg });
    }
  });
}
