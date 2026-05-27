import "./config/env.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerAllRoutes } from "./routes/index.js";
import { createAuditLog } from "./auth/audit.js";
import { startIntegrationScheduler } from "./integration/queue.js";
import { setupRulesExecutor } from "./rules/executor.js";
import { getUser } from "./store.js";
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

// Audit logging — log all write operations
app.addHook("onResponse", async (request, reply) => {
  if (["GET", "OPTIONS", "HEAD"].includes(request.method)) return;
  if (reply.statusCode >= 500) return;
  const userId = request.headers["x-user-id"] as string | undefined;
  const user = userId ? getUser(userId) : undefined;
  if (!user) return;
  const path = request.url.split("?")[0];
  const parts = path.split("/").filter(Boolean);
  const objectType = parts[0] || "unknown";
  const objectId = parts.length > 1 ? parts[1] : undefined;
  createAuditLog({
    enterpriseId: user.enterpriseId,
    userId: user.id,
    action: `${request.method} ${path}`,
    objectType,
    objectId,
    changes: request.body ? (typeof request.body === "object" ? request.body as Record<string, unknown> : {}) : {},
    ipAddress: request.ip,
  });
});

app.get("/health", async () => ({
  ok: true,
  service: "enterprise-flow-hub-backend",
}));

await registerAllRoutes(app);

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
