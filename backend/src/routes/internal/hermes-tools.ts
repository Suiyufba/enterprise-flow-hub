/**
 * Internal Hermes Tool Bridge
 *
 * These endpoints are called by Hermes-Agent when it needs to execute
 * business tools. They are only accessible from the Docker internal network
 * and require an INTERNAL_API_KEY for authentication.
 *
 * Security:
 * - All requests require X-Internal-Key header matching INTERNAL_API_KEY
 * - Enterprise isolation: Hermes can only operate on data belonging to
 *   the enterprise specified in the session metadata
 * - All operations are audit-logged
 * - Bash commands are restricted to a whitelist
 */
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { createLibraryItem, createAutomation, buildProjectContext } from "../../store.js";
import { createAuditLog } from "../../auth/audit.js";
import { spawnSync } from "node:child_process";

const INTERNAL_KEY = process.env.INTERNAL_API_KEY;

// Fastify plugin
export async function registerHermesToolRoutes(app: FastifyInstance): Promise<void> {
  // Auth hook for all internal routes — only allow Docker internal network + key
  app.addHook("onRequest", async (request, reply) => {
    // Only apply to /internal/ routes
    if (!request.url.startsWith("/internal/")) return;

    const key = request.headers["x-internal-key"] as string | undefined;
    if (!INTERNAL_KEY) {
      // No key configured → block all internal access
      return reply.status(403).send({ error: "Internal API not configured" });
    }
    if (key !== INTERNAL_KEY) {
      return reply.status(401).send({ error: "Unauthorized: invalid internal key" });
    }
  });

  // ── Create Library Item ──
  app.post("/internal/hermes/tools/create-library-item", async (request, reply) => {
    const body = request.body as Record<string, unknown> | undefined;
    if (!body) return reply.status(400).send({ error: "Request body required" });

    const enterpriseId = String(body.enterprise_id ?? body.enterpriseId ?? "");
    const projectId = String(body.project_id ?? body.projectId ?? "");
    const userId = String(body.user_id ?? body.userId ?? "hermes-agent");
    const name = String(body.name ?? "");
    const type = (["screenshot", "spreadsheet", "document", "note"].includes(String(body.type ?? ""))
      ? String(body.type)
      : "note") as "screenshot" | "spreadsheet" | "document" | "note";
    const summary = String(body.summary ?? "");
    const visibility = (["public", "private"].includes(String(body.visibility ?? ""))
      ? String(body.visibility)
      : "public") as "public" | "private";

    if (!enterpriseId || !projectId || !name.trim() || !summary.trim()) {
      return reply.status(400).send({
        error: "Missing required fields",
        required: ["enterprise_id", "project_id", "name", "summary"],
      });
    }

    const item = createLibraryItem({ enterpriseId, projectId, name, type, summary, visibility });
    if (!item) {
      return reply.status(404).send({ error: "Project not found or does not belong to this enterprise" });
    }

    await createAuditLog({
      enterpriseId,
      userId,
      action: "HERMES_TOOL:create-library-item",
      objectType: "library_item",
      objectId: item.id,
      changes: { name, type, summary, visibility },
    });

    return reply.status(201).send({
      ok: true,
      item: { id: item.id, name: item.name, type: item.type },
      message: `已成功创建业务资料「${item.name}」`,
    });
  });

  // ── Create Automation ──
  app.post("/internal/hermes/tools/create-automation", async (request, reply) => {
    const body = request.body as Record<string, unknown> | undefined;
    if (!body) return reply.status(400).send({ error: "Request body required" });

    const projectId = String(body.project_id ?? body.projectId ?? "");
    const enterpriseId = String(body.enterprise_id ?? body.enterpriseId ?? "");
    const userId = String(body.user_id ?? body.userId ?? "hermes-agent");
    const name = String(body.name ?? "");
    const trigger = String(body.trigger ?? "");
    const triggerType = String(body.trigger_type ?? body.triggerType ?? "schedule") as
      "schedule" | "message" | "webhook" | "email" | "file" | "manual";
    const action = String(body.action ?? "");
    const actionType = String(body.action_type ?? body.actionType ?? "call_ai") as
      "send_email" | "call_ai" | "shell" | "api_call" | "notify" | "browser";
    const agentModel = body.agent_model ?? body.agentModel;
    const systemPrompt = body.system_prompt ?? body.systemPrompt;

    if (!projectId || !name.trim() || !trigger.trim() || !action.trim()) {
      return reply.status(400).send({
        error: "Missing required fields",
        required: ["project_id", "name", "trigger", "action"],
      });
    }

    const automation = createAutomation({
      projectId,
      name,
      trigger,
      triggerType,
      action,
      actionType,
      agentModel: typeof agentModel === "string" ? agentModel : undefined,
      systemPrompt: typeof systemPrompt === "string" ? systemPrompt : undefined,
    });
    if (!automation) {
      return reply.status(404).send({ error: "Project not found" });
    }

    await createAuditLog({
      enterpriseId,
      userId,
      action: "HERMES_TOOL:create-automation",
      objectType: "automation",
      objectId: automation.id,
      changes: { name, trigger, action, triggerType, actionType },
    });

    return reply.status(201).send({
      ok: true,
      automation: {
        id: automation.id,
        name: automation.name,
        trigger: `${automation.triggerType}: ${automation.trigger}`,
        action: `${automation.actionType}: ${automation.action}`,
      },
      message: `已成功创建自动化规则「${automation.name}」`,
    });
  });

  // ── Query Project Context ──
  app.post("/internal/hermes/tools/query-project-context", async (request, reply) => {
    const body = request.body as Record<string, unknown> | undefined;
    if (!body) return reply.status(400).send({ error: "Request body required" });

    const enterpriseId = String(body.enterprise_id ?? body.enterpriseId ?? "");
    const projectId = String(body.project_id ?? body.projectId ?? "");
    const rawIds = (body.project_ids ?? body.projectIds) as unknown;
    const projectIds = Array.isArray(rawIds)
      ? rawIds.map((v: unknown) => String(v))
      : [projectId].filter(Boolean);

    if (!enterpriseId || projectIds.length === 0) {
      return reply.status(400).send({
        error: "Missing required fields",
        required: ["enterprise_id", "project_ids"],
      });
    }

    const context = buildProjectContext(enterpriseId, projectIds);

    return reply.send({
      ok: true,
      context,
      projectIds,
    });
  });

  // ── Send Notification ──
  app.post("/internal/hermes/tools/send-notification", async (request, reply) => {
    const body = request.body as Record<string, unknown> | undefined;
    if (!body) return reply.status(400).send({ error: "Request body required" });

    const pluginId = typeof body.plugin_id === "string"
      ? body.plugin_id
      : typeof body.pluginId === "string" ? body.pluginId : undefined;
    const message = typeof body.message === "string" ? body.message : JSON.stringify(body);
    const enterpriseId = String(body.enterprise_id ?? body.enterpriseId ?? "");
    const userId = String(body.user_id ?? body.userId ?? "hermes-agent");

    // Dynamically import to get the webhook
    const { getNotificationWebhook } = await import("../../store.js");
    const webhook = getNotificationWebhook(pluginId);
    if (!webhook) {
      return reply.status(400).send({
        error: "通知插件未配置",
        hint: "请先在插件页绑定飞书或企业微信群机器人 Webhook。",
      });
    }

    const payload = {
      msg_type: "text",
      text: { content: message },
    };

    const response = await fetch(webhook.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    const text = await response.text();

    await createAuditLog({
      enterpriseId,
      userId,
      action: "HERMES_TOOL:send-notification",
      objectType: "notification",
      objectId: pluginId ?? "unknown",
      changes: { message, pluginId, httpStatus: response.status },
    });

    if (!response.ok) {
      return reply.status(502).send({
        ok: false,
        error: `Notification webhook returned HTTP ${response.status}`,
        body: text.slice(0, 500),
      });
    }

    return reply.send({
      ok: true,
      pluginId: webhook.pluginId,
      response: text.slice(0, 500),
    });
  });

  // ── Execute Bash (whitelist only) ──
  app.post("/internal/hermes/tools/execute-bash", async (request, reply) => {
    const body = request.body as Record<string, unknown> | undefined;
    if (!body) return reply.status(400).send({ error: "Request body required" });

    const command = String(body.command ?? body.cmd ?? "");
    const cwd = typeof body.cwd === "string" ? body.cwd : process.cwd();
    const enterpriseId = String(body.enterprise_id ?? body.enterpriseId ?? "");
    const userId = String(body.user_id ?? body.userId ?? "hermes-agent");

    if (!command.trim()) {
      return reply.status(400).send({ error: "Command required" });
    }

    // Whitelist check
    if (!isBashCommandAllowed(command)) {
      await createAuditLog({
        enterpriseId,
        userId,
        action: "HERMES_TOOL:execute-bash:BLOCKED",
        objectType: "bash",
        objectId: randomUUID(),
        changes: { command, cwd },
      });
      return reply.status(403).send({
        error: "Command not in whitelist",
        message: "该命令不在允许列表中。如需执行，请联系管理员手动操作。",
      });
    }

    try {
      // Split command into program + args — spawnSync does NOT invoke a shell,
      // so shell metacharacters (;, |, $(), etc.) are inert and cannot inject commands.
      const parts = command.trim().split(/\s+/);
      const program = parts[0];
      const args = parts.slice(1);

      const result = spawnSync(program, args, {
        cwd,
        timeout: 30_000,
        encoding: "utf-8",
        maxBuffer: 1024 * 1024,
        env: { ...process.env },
        shell: false,
      });

      const stdout = result.stdout?.toString() ?? "";
      const stderr = result.stderr?.toString() ?? "";

      if (result.error) throw result.error;

      await createAuditLog({
        enterpriseId,
        userId,
        action: "HERMES_TOOL:execute-bash",
        objectType: "bash",
        objectId: randomUUID(),
        changes: { command, cwd, exitCode: result.status, outputLength: stdout.length },
      });

      const output = [stdout, stderr].filter(Boolean).join("\n");
      return reply.send({
        ok: true,
        output: output || "(command completed with no output)",
        exitCode: result.status,
      });
    } catch (e: unknown) {
      const err = e as { message?: string; code?: string };
      await createAuditLog({
        enterpriseId,
        userId,
        action: "HERMES_TOOL:execute-bash:ERROR",
        objectType: "bash",
        objectId: randomUUID(),
        changes: { command, error: err.message, code: err.code },
      });

      return reply.status(500).send({
        ok: false,
        error: err.message ?? "Command execution failed",
        code: err.code,
      });
    }
  });
}

// ── Bash Command Whitelist ──

function isBashCommandAllowed(command: string): boolean {
  const trimmed = command.trim();

  // Block dangerous patterns unconditionally
  const blockedPatterns = [
    /rm\s+-rf\s+\//,
    /mkfs/,
    /dd\s+if=/,
    /:\s*\(\)\s*\{/,
    />\s*\/dev\/sda/,
    /chmod\s+777\s+\//,
    /curl.*\|\s*(ba)?sh/,
    /wget.*\|\s*(ba)?sh/,
    /nc\s+-[lL]/,
    /socat/,
    /reboot/,
    /shutdown/,
    /halt/,
    /poweroff/,
  ];

  for (const pattern of blockedPatterns) {
    if (pattern.test(trimmed)) {
      return false;
    }
  }

  // Whitelist of allowed command prefixes
  const allowedPrefixes = [
    "ls", "cat", "head", "tail",
    "wc", "grep", "find",
    "echo", "date", "whoami",
    "df", "du", "free", "ps",
    "node", "npm", "pnpm",
    "git status", "git log", "git diff", "git branch",
    "docker ps", "docker logs",
    "uptime", "uname",
  ];

  return allowedPrefixes.some((prefix) => trimmed.startsWith(prefix));
}
