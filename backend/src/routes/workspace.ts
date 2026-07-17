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
  getLibraryItem,
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
  listPersonas,
  listSkills,
  listTools,
  getRuntimeProvider,
  buildProjectContext,
} from "../store.js";
import { runAutomationNow, triggerProjectAutomations } from "../automation/scheduler.js";
import { getRuntime } from "../agent/runtime.js";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { notifyExecute } from "../tools/executors/notify.js";
import { emitEvent } from "../events/emitter.js";
import { canAccessEnterprise, getRequestActor, requireAdminActor } from "./auth-context.js";

const activeRuns = new Map<string, { abort: () => void }>();
const configuredAgentTimeoutMs = Number(process.env.AGENT_RUN_TIMEOUT_MS ?? 180_000);
const agentRunTimeoutMs = Number.isFinite(configuredAgentTimeoutMs)
  ? Math.max(30_000, configuredAgentTimeoutMs)
  : 180_000;
const allowedCorsOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000,http://localhost:3001")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function sseCorsHeaders(origin: string | undefined): Record<string, string> {
  if (!origin || (!allowedCorsOrigins.includes(origin) && !allowedCorsOrigins.includes("*"))) return {};
  return {
    "Access-Control-Allow-Origin": allowedCorsOrigins.includes("*") ? "*" : origin,
    Vary: "Origin",
  };
}

function agentFailureMessage(message: string): string {
  if (/401|403|auth|api key/i.test(message)) return "模型账号认证失败，请到设置中检查 API Key。";
  if (/timeout|timed out|ETIMEDOUT/i.test(message)) return "模型服务响应超时，请稍后重试。";
  if (/max.turn|回合上限/i.test(message)) return "本轮工具调用达到安全上限，系统已停止继续查询。";
  return "Agent 执行遇到异常，系统已安全停止本轮任务，请重新发送后再试。";
}

async function requireAdmin(request: Parameters<typeof requireAdminActor>[0], reply: Parameters<typeof requireAdminActor>[1]) {
  requireAdminActor(request, reply);
}

export async function workspaceRoutes(app: FastifyInstance) {
  app.get("/workspace", async (request) => {
    const actor = getRequestActor(request);
    return getWorkspace(actor?.role === "admin" ? undefined : actor?.enterpriseId);
  });

  app.get("/projects/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const workspace = getWorkspace();
    const project = getProject(id);
    if (!project) {
      return reply.status(404).send({ error: "Project not found" });
    }
    if (!canAccessEnterprise(request, project.enterpriseId, reply)) return;
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
    const actor = getRequestActor(request);
    if (parsed.data.enterpriseId && !canAccessEnterprise(request, parsed.data.enterpriseId, reply)) return;
    if (!parsed.data.enterpriseId && actor?.role !== "admin") return reply.status(403).send({ error: "仅管理员可创建新企业" });
    const project = createProject(parsed.data);
    emitEvent("create", "project", project.id, project as unknown as Record<string, unknown>, "api");
    return reply.status(201).send(project);
  });

  app.patch("/projects/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getProject(id);
    if (!existing) return reply.status(404).send({ error: "Project not found" });
    if (!canAccessEnterprise(request, existing.enterpriseId, reply)) return;
    const parsed = UpdateProjectRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const project = updateProject(id, parsed.data);
    if (!project) {
      return reply.status(404).send({ error: "Project not found" });
    }
    emitEvent("update", "project", project.id, project as unknown as Record<string, unknown>, "api");
    return project;
  });

  app.delete("/projects/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getProject(id);
    if (existing && !canAccessEnterprise(request, existing.enterpriseId, reply)) return;
    const ok = deleteProject(id);
    if (!ok) {
      return reply.status(404).send({ error: "Project not found" });
    }
    if (existing) emitEvent("delete", "project", id, existing as unknown as Record<string, unknown>, "api");
    return reply.status(204).send();
  });

  app.post("/library", async (request, reply) => {
    const parsed = CreateLibraryItemRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    if (!canAccessEnterprise(request, parsed.data.enterpriseId, reply)) return;
    const item = createLibraryItem(parsed.data);
    if (!item) {
      return reply.status(404).send({ error: "Project not found" });
    }
    return reply.status(201).send(item);
  });

  app.patch("/library/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getLibraryItem(id);
    if (!existing) return reply.status(404).send({ error: "Library item not found" });
    if (!canAccessEnterprise(request, existing.enterpriseId, reply)) return;
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
    const existing = getLibraryItem(id);
    if (!existing) return reply.status(404).send({ error: "Library item not found" });
    if (!canAccessEnterprise(request, existing.enterpriseId, reply)) return;
    const ok = deleteLibraryItem(id);
    if (!ok) {
      return reply.status(404).send({ error: "Library item not found" });
    }
    return reply.status(204).send();
  });

  app.patch("/plugins/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
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

  app.get("/plugins/:id/config", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const config = getPluginConfig(id);
    if (!config) {
      return reply.status(404).send({ error: "Plugin not found" });
    }
    return config;
  });

  app.patch("/plugins/:id/config", { preHandler: [requireAdmin] }, async (request, reply) => {
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

  app.post("/plugins/:id/test", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const output = await notifyExecute({ pluginId: id, message: "Enterprise Flow Hub 通知连接测试成功。" });
      const parsed = JSON.parse(output) as { ok?: boolean; error?: string };
      if (!parsed.ok) return reply.status(400).send(parsed);
      return parsed;
    } catch (error) {
      return reply.status(502).send({ error: error instanceof Error ? error.message : "通知测试失败" });
    }
  });

  app.post("/automations", async (request, reply) => {
    const parsed = CreateAutomationRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const project = getProject(parsed.data.projectId);
    if (!project) return reply.status(404).send({ error: "Project not found" });
    if (!canAccessEnterprise(request, project.enterpriseId, reply)) return;
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
    const current = getAutomation(id);
    const currentProject = current ? getProject(current.projectId) : undefined;
    if (!current || !currentProject) return reply.status(404).send({ error: "Automation not found" });
    if (!canAccessEnterprise(request, currentProject.enterpriseId, reply)) return;
    const body = request.body as Record<string, unknown>;
    // Toggle-only mode (backwards compatible)
    if (typeof body.enabled === "boolean" && Object.keys(body).length === 1) {
      let automation;
      try {
        automation = setAutomationEnabled(id, body.enabled);
      } catch (error) {
        return reply.status(400).send({ error: error instanceof Error ? error.message : "Automation is not ready" });
      }
      if (!automation) return reply.status(404).send({ error: "Automation not found" });
      return automation;
    }
    // Full update mode
    const parsed = CreateAutomationRequestSchema.partial().safeParse(body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    if (parsed.data.projectId) {
      const nextProject = getProject(parsed.data.projectId);
      if (!nextProject || !canAccessEnterprise(request, nextProject.enterpriseId, reply)) return;
    }
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
    const current = getAutomation(id);
    const project = current ? getProject(current.projectId) : undefined;
    if (!current || !project) return reply.status(404).send({ error: "Automation not found" });
    if (!canAccessEnterprise(request, project.enterpriseId, reply)) return;
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
    const suppliedSecret = request.headers["x-efh-webhook-secret"];
    const expectedSecret = current.webhookSecret ?? "";
    const supplied = typeof suppliedSecret === "string" ? suppliedSecret : "";
    const validSecret = supplied.length === expectedSecret.length && supplied.length > 0 &&
      timingSafeEqual(Buffer.from(supplied), Buffer.from(expectedSecret));
    if (!validSecret) return reply.status(401).send({ error: "Webhook secret is missing or invalid" });
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
    if (type !== "file") {
      return reply.status(400).send({ error: "Unsupported event type" });
    }
    const current = getAutomation(id);
    if (!current) return reply.status(404).send({ error: "Automation not found" });
    const project = getProject(current.projectId);
    if (!project || !canAccessEnterprise(request, project.enterpriseId, reply)) return;
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
    const current = getAutomation(id);
    const project = current ? getProject(current.projectId) : undefined;
    if (!current || !project) return reply.status(404).send({ error: "Automation not found" });
    if (!canAccessEnterprise(request, project.enterpriseId, reply)) return;
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
    if (!canAccessEnterprise(request, detail.enterpriseId, reply)) return;
    return detail;
  });

  app.patch("/conversations/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getConversation(id);
    if (!existing) return reply.status(404).send({ error: "Conversation not found" });
    if (!canAccessEnterprise(request, existing.enterpriseId, reply)) return;
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
    if (!canAccessEnterprise(request, parsed.data.enterpriseId, reply)) return;
    const detail = createConversation(parsed.data);
    if (!detail) {
      return reply.status(400).send({ error: "Project does not belong to enterprise" });
    }
    return reply.status(201).send(detail);
  });

  app.post("/skills", { preHandler: [requireAdmin] }, async (request, reply) => {
    const parsed = CreateSkillRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    return reply.status(201).send(createSkill(parsed.data));
  });

  app.patch("/skills/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
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

  app.delete("/skills/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = deleteSkill(id);
    if (!ok) {
      return reply.status(404).send({ error: "Skill not found" });
    }
    return reply.status(204).send();
  });

  app.delete("/conversations/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getConversation(id);
    if (!existing) return reply.status(404).send({ error: "Conversation not found" });
    if (!canAccessEnterprise(request, existing.enterpriseId, reply)) return;
    const ok = deleteConversation(id);
    if (!ok) {
      return reply.status(404).send({ error: "Conversation not found" });
    }
    return reply.status(204).send();
  });

  // Stop an active agent run for this conversation
  app.post("/conversations/:id/stop", async (request, reply) => {
    const { id } = request.params as { id: string };
    const actor = (request as unknown as Record<string, unknown>).actor as { id: string; enterpriseId: string; role: "admin" | "member" } | undefined;
    if (!actor?.id) {
      return reply.status(401).send({ error: "Authentication required" });
    }
    // Verify conversation ownership
    const conv = getConversation(id);
    if (!conv) {
      return reply.status(404).send({ error: "Conversation not found" });
    }
    if (actor.role !== "admin" && conv.enterpriseId !== actor.enterpriseId) {
      return reply.status(403).send({ error: "Access denied: enterprise mismatch" });
    }
    const entry = activeRuns.get(id);
    if (!entry) {
      return reply.status(404).send({ error: "No active run for this conversation" });
    }
    entry.abort();
    activeRuns.delete(id);
    return { ok: true, message: "Run stopped" };
  });

  app.post("/conversations/:id/messages", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = AddMessageRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    try {
      const before = getConversation(id);
      if (!before) return reply.status(404).send({ error: "Conversation not found" });
      if (!canAccessEnterprise(request, before.enterpriseId, reply)) return;
      const actor = (request as unknown as Record<string, unknown>).actor as { id: string } | undefined;
      const result = await addMessage(id, parsed.data, actor?.id);
      if (!result) {
        return reply.status(404).send({ error: "Conversation not found" });
      }
      if (before) {
        void triggerProjectAutomations(
          "message",
          before.projectId,
          { source: "message", conversationId: id, content: parsed.data.content },
          app.log,
        ).catch((error) => app.log.error({ err: error, conversationId: id }, "Message automation failed"));
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

  // SSE streaming endpoint for real-time agent events
  app.post("/conversations/:id/messages/stream", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = AddMessageRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const before = getConversation(id);
    if (!before) {
      return reply.status(404).send({ error: "Conversation not found" });
    }
    const actor = (request as unknown as Record<string, unknown>).actor as { id: string; enterpriseId: string; role: "admin" | "member" } | undefined;
    // Enterprise isolation: actor must belong to the conversation's enterprise
    if (actor && actor.role !== "admin" && actor.enterpriseId && actor.enterpriseId !== before.enterpriseId) {
      return reply.status(403).send({ error: "Access denied: enterprise mismatch" });
    }

    // Build context (same logic as addMessage in store.ts)
    const personas = listPersonas();
    const skills = listSkills();
    const tools = listTools();
    const persona = personas.find((item) => item.id === parsed.data.personaId) ?? personas[0];
    const selectedSkillIds = parsed.data.skillIds?.length ? parsed.data.skillIds : persona?.defaultSkillIds ?? [];
    const selectedSkills = skills.filter((item) => selectedSkillIds.includes(item.id));
    const provider = getRuntimeProvider(persona?.providerId) ?? getRuntimeProvider();
    if (!provider) {
      return reply.status(400).send({ error: "没有找到可用的 AI 模型账号" });
    }
    const thinkingProvider = persona?.thinkingProviderId
      ? getRuntimeProvider(persona.thinkingProviderId)
      : undefined;
    const contextLabel =
      parsed.data.contextScope === "selected_projects"
        ? `结合 ${parsed.data.contextProjectIds?.length ?? 0} 个指定项目资料`
        : "仅分析当前项目资料";
    const contextProjectIds =
      parsed.data.contextScope === "selected_projects" && parsed.data.contextProjectIds?.length
        ? parsed.data.contextProjectIds
        : [before.projectId];
    const projectContext = buildProjectContext(before.enterpriseId, contextProjectIds);

    // Load history
    const { db } = await import("../store.js");
    const rows = db().prepare(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
    ).all(id) as Record<string, unknown>[];
    const history = rows.map((r) => ({
      id: r.id as string,
      role: r.role as "user" | "assistant",
      content: r.content as string,
      createdAt: r.created_at as string,
    }));

    // Insert user message
    const userMsgId = `msg-${randomUUID()}`;
    db().prepare(
      "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(userMsgId, id, "user", parsed.data.content, new Date().toISOString());

    // Set up SSE response headers
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      ...sseCorsHeaders(request.headers.origin),
    });

    const sendSSE = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Register this SSE session so the stop endpoint can abort it
    const abortController = new AbortController();
    let stoppedByUser = false;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      abortController.abort();
    }, agentRunTimeoutMs);
    const abortRun = () => {
      stoppedByUser = true;
      abortController.abort();
      try { reply.raw.destroy(); } catch { /* already closed */ }
    };
    activeRuns.set(id, { abort: abortRun });

    let aiContent = "";
    let aiMsgId = "";
    const finishRun = (
      content: string,
      options: { planSteps?: unknown[]; toolRuns?: unknown[]; interrupted?: boolean } = {},
    ) => {
      aiContent = content;
      if (!aiMsgId) {
        aiMsgId = `msg-${randomUUID()}`;
        db().prepare(
          "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
        ).run(aiMsgId, id, "assistant", aiContent, new Date().toISOString());
      }
      sendSSE("done", {
        message: { id: aiMsgId, role: "assistant", content: aiContent, createdAt: new Date().toISOString() },
        planSteps: options.planSteps,
        toolRuns: options.toolRuns,
        interrupted: options.interrupted ?? false,
      });
    };

    try {
      const runtime = await getRuntime(actor?.id);

      for await (const event of runtime.runStream({
        userContent: parsed.data.content,
        history,
        persona,
        skills: selectedSkills,
        tools,
        provider,
        thinkingProvider,
        context: {
          conversationTitle: before.title,
          contextLabel,
          projectContext,
          enterpriseId: before.enterpriseId,
          projectId: before.projectId,
        },
        sessionId: id,
        abortController,
      })) {
        switch (event.type) {
          case "thinking":
            sendSSE("thinking", { message: event.message });
            break;
          case "tool_call":
            sendSSE("tool_call", { toolId: event.toolId, toolName: event.toolName, input: event.input });
            break;
          case "tool_result":
            sendSSE("tool_result", { toolId: event.toolId, status: event.status, output: event.output });
            break;
          case "content_chunk":
            aiContent += event.delta;
            sendSSE("content_chunk", { delta: event.delta });
            break;
          case "plan_update":
            sendSSE("plan_update", { planSteps: event.planSteps });
            break;
          case "done": {
            finishRun(event.content || aiContent || "任务已完成。", {
              planSteps: event.planSteps,
              toolRuns: event.toolRuns,
            });
            break;
          }
          case "error": {
            if (stoppedByUser) break;
            const failure = timedOut
              ? `Agent 在 ${Math.round(agentRunTimeoutMs / 1000)} 秒内未完成，系统已停止本轮任务。`
              : agentFailureMessage(event.message);
            const finalContent = aiContent.trim()
              ? `${aiContent.trim()}\n\n> ${failure} 上面的内容是未完成的过程记录，不应视为最终结论。`
              : `## 本轮执行未完成\n\n${failure}`;
            finishRun(finalContent, { interrupted: true });
            break;
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      app.log.error({ err, conversationId: id }, "Agent streaming run failed");
      if (!stoppedByUser && !aiMsgId) {
        const failure = timedOut
          ? `Agent 在 ${Math.round(agentRunTimeoutMs / 1000)} 秒内未完成，系统已停止本轮任务。`
          : agentFailureMessage(msg);
        const finalContent = aiContent.trim()
          ? `${aiContent.trim()}\n\n> ${failure} 上面的内容是未完成的过程记录，不应视为最终结论。`
          : `## 本轮执行未完成\n\n${failure}`;
        finishRun(finalContent, { interrupted: true });
      }
    } finally {
      clearTimeout(timeout);
      activeRuns.delete(id);
      reply.raw.end();
    }

    // Trigger automations fire-and-forget
    if (before) {
      void triggerProjectAutomations(
        "message",
        before.projectId,
        { source: "message", conversationId: id, content: parsed.data.content },
        app.log,
      ).catch((error) => app.log.error({ err: error, conversationId: id }, "Message automation failed"));
    }
  });
}
