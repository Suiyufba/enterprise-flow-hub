import "./config/env.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerAllRoutes } from "./routes/index.js";
import { registerHermesToolRoutes } from "./routes/internal/hermes-tools.js";
import { createAuditLog } from "./auth/audit.js";
import { getRuntime, resetRuntimeCache } from "./agent/runtime.js";
import { startIntegrationScheduler } from "./integration/queue.js";
import { setupRulesExecutor } from "./rules/executor.js";
import { getUser } from "./store.js";
import { validateSession } from "./auth/service.js";
import { registerTool } from "./tools/registry.js";
import { csvProfile } from "./tools/executors/csv-profile.js";
import { bashExecute } from "./tools/executors/bash-executor.js";
import { automationExecute } from "./tools/executors/automation-executor.js";
import { libraryItemExecute } from "./tools/executors/library-item-executor.js";
import { notifyExecute } from "./tools/executors/notify.js";
import { runAllPersonaSummaries } from "./store.js";
import { startAutomationScheduler } from "./automation/scheduler.js";

// Register tool executors so agent can actually execute tools
registerTool("tool-csv-profile", csvProfile);
registerTool("tool-bash", bashExecute);
registerTool("tool-create-library-item", libraryItemExecute);
registerTool("tool-create-automation", automationExecute);
registerTool("tool-feishu-notify", notifyExecute);

const API_KEY = process.env.API_KEY;

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
    : ["http://localhost:3000", "http://localhost:3001"],
});

// API key auth hook — skipped when API_KEY is not configured (dev mode)
app.addHook("onRequest", async (request, reply) => {
  if (!API_KEY) return;
  if (request.url === "/health") return;
  if (request.method === "OPTIONS") return;

  const header = request.headers.authorization;
  const key = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (key !== API_KEY) {
    return reply.status(401).send({ error: "Unauthorized" });
  }
});

// User auth hook — resolve user from JWT token or x-user-id header
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

  // Fall back to x-user-id header (legacy)
  const userId = request.headers["x-user-id"] as string | undefined;
  if (userId) {
    const user = getUser(userId);
    if (user) {
      (request as unknown as Record<string, unknown>).actor = user;
    }
  }
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
  const isHermes = runtimeHealth.version !== "legacy" && runtimeHealth.ok;
  return {
    ok: true,
    service: "enterprise-flow-hub-backend",
    agent: {
      runtime: process.env.AGENT_RUNTIME ?? "legacy",
      activeRuntime: runtimeHealth.ok && runtimeHealth.version === "legacy" ? "legacy" : (isHermes ? "hermes" : "unknown"),
      hermes: {
        connected: isHermes,
        version: isHermes ? runtimeHealth.version : undefined,
        model: isHermes ? runtimeHealth.model : undefined,
      },
    },
  };
});

// Hermes status endpoint for frontend settings — requires auth
app.get("/api/agent/status", async (request, reply) => {
  const actor = (request as unknown as Record<string, unknown>).actor as { id: string } | undefined;
  if (!actor) {
    return reply.status(401).send({ error: "Authentication required" });
  }

  const runtime = await getRuntime(actor.id);
  const runtimeHealth = await runtime.health();
  const isHermes = runtimeHealth.version !== "legacy" && runtimeHealth.ok;
  return {
    runtime: process.env.AGENT_RUNTIME ?? "legacy",
    fallbackRuntime: process.env.AGENT_FALLBACK_RUNTIME ?? "legacy",
    activeRuntime: isHermes ? "hermes" : "legacy",
    hermes: {
      connected: isHermes,
      version: isHermes ? runtimeHealth.version : undefined,
      model: isHermes ? runtimeHealth.model : undefined,
      url: process.env.HERMES_API_URL ? "[internal]" : undefined,
    },
    enabledUserIds: (process.env.HERMES_ENABLED_USER_IDS ?? "").trim() || null,
  };
});

// Stop an active Hermes run
app.post("/api/agent/runs/:runId/stop", async (request, reply) => {
  const actor = (request as unknown as Record<string, unknown>).actor as { id: string } | undefined;
  if (!actor?.id) {
    return reply.status(401).send({ error: "Authentication required" });
  }
  const { runId } = request.params as { runId: string };
  try {
    const { HermesClient } = await import("./agent/hermes-client.js");
    const client = new HermesClient();
    await client.stopRun(runId);
    return { ok: true, message: "Run stopped" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return reply.status(500).send({ ok: false, error: msg });
  }
});

// Reset runtime cache — admin only
app.post("/api/agent/reset-runtime", async (request, reply) => {
  const actor = (request as unknown as Record<string, unknown>).actor as { id: string; role?: string } | undefined;
  if (!actor?.id) {
    return reply.status(401).send({ error: "Authentication required" });
  }
  resetRuntimeCache();
  return { ok: true, message: "Runtime cache reset" };
});

await registerAllRoutes(app);
await registerHermesToolRoutes(app);

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

// Initialize rules engine event subscription
setupRulesExecutor();

await app.listen({ port, host });
startAutomationScheduler(app.log);
startIntegrationScheduler();

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
