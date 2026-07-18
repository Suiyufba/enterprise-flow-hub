import "./config/env.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerAllRoutes } from "./routes/index.js";
import { createAuditLog } from "./auth/audit.js";
import { getRuntime, resetRuntimeCache } from "./agent/runtime.js";
import { startIntegrationScheduler } from "./integration/queue.js";
import { startFeishuEventStream } from "./integration/feishu-event-stream.js";
import { setupRulesExecutor } from "./rules/executor.js";
import { validateSession } from "./auth/service.js";
import { registerTool } from "./tools/registry.js";
import { csvProfile } from "./tools/executors/csv-profile.js";
import { automationExecute } from "./tools/executors/automation-executor.js";
import { libraryItemExecute } from "./tools/executors/library-item-executor.js";
import { notifyExecute } from "./tools/executors/notify.js";
import { companyContextExecute } from "./tools/executors/company-context.js";
import { businessQueryExecute } from "./tools/executors/business-query.js";
import { businessActionExecute } from "./tools/executors/business-action.js";
import { browserCheckExecute } from "./tools/executors/browser-check.js";
import { runAllPersonaSummaries } from "./store.js";
import { startAutomationScheduler } from "./automation/scheduler.js";

// Register tool executors so agent can actually execute tools
registerTool("tool-csv-profile", csvProfile);
registerTool("tool-create-library-item", libraryItemExecute);
registerTool("tool-create-automation", automationExecute);
registerTool("tool-feishu-notify", notifyExecute);
registerTool("tool-mcp-company-context", companyContextExecute);
registerTool("tool-business-query", businessQueryExecute);
registerTool("tool-business-action", businessActionExecute);
registerTool("tool-browser-check", browserCheckExecute);

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
    : ["http://localhost:3000", "http://localhost:3001"],
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
});

// Resolve the signed browser session and attach its user to the request.
// Attaches user to request for downstream middleware and routes
app.addHook("onRequest", async (request) => {
  // Skip if already has user attached
  if ((request as unknown as Record<string, unknown>).actor) return;

  // Try JWT Bearer token first
  const auth = request.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    // Only try session validation for tokens that look like session tokens (96 hex chars)
    if (token.length === 96 && /^[a-f0-9]+$/.test(token)) {
      const user = validateSession(token);
      if (user) {
        (request as unknown as Record<string, unknown>).actor = user;
        return;
      }
    }
  }

});

// The browser login page is the only public product surface. Webhooks use their own secret.
app.addHook("onRequest", async (request, reply) => {
  if (request.method === "OPTIONS") return;
  const path = request.url.split("?")[0];
  const isPublic = path === "/health" || path === "/auth/login" || path === "/integrations/feishu/events" || /^\/automations\/[^/]+\/webhook$/.test(path);
  if (isPublic) return;
  const actor = (request as unknown as Record<string, unknown>).actor as { id?: string } | undefined;
  if (!actor?.id) return reply.status(401).send({ error: "未登录或会话已过期" });
});

// Audit logging — log all write operations
app.addHook("onResponse", async (request, reply) => {
  if (["GET", "OPTIONS", "HEAD"].includes(request.method)) return;
  if (reply.statusCode >= 500) return;
  const actor = (request as unknown as Record<string, unknown>).actor as { id: string; enterpriseId: string } | undefined;
  if (!actor) return;
  const path = request.url.split("?")[0];
  const parts = path.split("/").filter(Boolean);
  createAuditLog({
    enterpriseId: actor.enterpriseId,
    userId: actor.id,
    action: `${request.method} ${path}`,
    objectType: parts[0] || "unknown",
    objectId: parts.length > 1 ? parts[1] : undefined,
    changes: request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {},
    ipAddress: request.ip,
  });
});

app.get("/health", async () => {
  const runtime = await getRuntime();
  const runtimeHealth = await runtime.health();
  const isClaudeCode = runtimeHealth.version !== "legacy" && runtimeHealth.ok;
  return {
    ok: true,
    service: "enterprise-flow-hub-backend",
    agent: {
      runtime: process.env.AGENT_RUNTIME ?? "claude-code",
      activeRuntime: isClaudeCode ? "claude-code" : "legacy",
      claudeCode: {
        connected: isClaudeCode,
        version: isClaudeCode ? runtimeHealth.version : undefined,
        model: isClaudeCode ? runtimeHealth.model : undefined,
      },
    },
  };
});

// The runtime status is secret-free but still belongs to the authenticated product surface.
app.get("/agent/status", async () => {
  const runtime = await getRuntime();
  const runtimeHealth = await runtime.health();
  const isClaudeCode = runtimeHealth.version !== "legacy" && runtimeHealth.ok;
  return {
    runtime: process.env.AGENT_RUNTIME ?? "claude-code",
    fallbackRuntime: process.env.AGENT_FALLBACK_RUNTIME ?? "legacy",
    activeRuntime: isClaudeCode ? "claude-code" : "legacy",
    claudeCode: {
      connected: isClaudeCode,
      version: isClaudeCode ? runtimeHealth.version : undefined,
      model: isClaudeCode ? runtimeHealth.model : undefined,
      executable: process.env.CLAUDE_CODE_EXECUTABLE ? "custom" : "sdk-bundled",
    },
  };
});

// Reset runtime cache — admin only
app.post("/agent/reset-runtime", async (request, reply) => {
  const actor = (request as unknown as Record<string, unknown>).actor as { id: string; role?: string } | undefined;
  if (!actor?.id) {
    return reply.status(401).send({ error: "Authentication required" });
  }
  if (actor.role !== "admin") {
    return reply.status(403).send({ error: "Admin access required" });
  }
  resetRuntimeCache();
  return { ok: true, message: "Runtime cache reset" };
});

await registerAllRoutes(app);

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

// Initialize rules engine event subscription
setupRulesExecutor();

await app.listen({ port, host });
startAutomationScheduler(app.log);
startIntegrationScheduler();
startFeishuEventStream(app.log);

// Schedule daily midnight persona memory summarization
function scheduleMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const msUntilMidnight = midnight.getTime() - now.getTime();

  setTimeout(async () => {
    app.log.info("Running daily persona memory summarization...");
    try {
      await runAllPersonaSummaries();
      app.log.info("Daily summarization complete.");
    } catch (e) {
      app.log.error({ err: e }, "Daily summarization failed");
    }
    scheduleMidnight(); // schedule next run
  }, msUntilMidnight);
}
scheduleMidnight();
