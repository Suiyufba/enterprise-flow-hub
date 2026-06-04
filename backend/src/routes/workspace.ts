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
  listPersonas,
  listSkills,
  listTools,
  getRuntimeProvider,
  buildProjectContext,
} from "../store.js";
import { runAutomationNow, triggerProjectAutomations } from "../automation/scheduler.js";
import { getRuntime } from "../agent/runtime.js";
import { HermesClient } from "../agent/hermes-client.js";
import { randomUUID } from "node:crypto";

// Track active Hermes runs per conversation for stop support
const activeRuns = new Map<string, { runId: string; abort: () => void }>();

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

  // Stop an active agent run for this conversation
  app.post("/conversations/:id/stop", async (request, reply) => {
    const { id } = request.params as { id: string };
    const actor = (request as unknown as Record<string, unknown>).actor as { id: string } | undefined;
    if (!actor?.id) {
      return reply.status(401).send({ error: "Authentication required" });
    }
    const entry = activeRuns.get(id);
    if (!entry) {
      return reply.status(404).send({ error: "No active run for this conversation" });
    }
    try {
      const client = new HermesClient();
      await client.stopRun(entry.runId);
    } catch {
      // Hermes may already be stopped — that's fine
    }
    entry.abort(); // Also abort the SSE connection
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
    const actor = (request as unknown as Record<string, unknown>).actor as { id: string; enterpriseId: string } | undefined;
    // Enterprise isolation: actor must belong to the conversation's enterprise
    if (actor && actor.enterpriseId && actor.enterpriseId !== before.enterpriseId) {
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
    });

    const sendSSE = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Register this SSE session so the stop endpoint can abort it
    const abortSSE = () => { try { reply.raw.destroy(); } catch { /* already closed */ } };
    activeRuns.set(id, { runId: "", abort: abortSSE });

    let aiContent = "";
    let aiMsgId = "";

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
            aiContent = event.content || aiContent;
            aiMsgId = `msg-${randomUUID()}`;
            db().prepare(
              "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
            ).run(aiMsgId, id, "assistant", aiContent, new Date().toISOString());
            sendSSE("done", {
              message: { id: aiMsgId, role: "assistant", content: aiContent, createdAt: new Date().toISOString() },
              planSteps: event.planSteps,
              toolRuns: event.toolRuns,
            });
            break;
          }
          case "error":
            // Store partial reply if we have content
            if (aiContent && !aiMsgId) {
              aiMsgId = `msg-${randomUUID()}`;
              db().prepare(
                "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
              ).run(aiMsgId, id, "assistant", aiContent, new Date().toISOString());
            }
            sendSSE("error", { message: event.message });
            break;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sendSSE("error", { message: msg });
    } finally {
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
      );
    }
  });
}
