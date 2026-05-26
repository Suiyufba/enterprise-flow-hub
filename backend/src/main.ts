import "./config/env.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { analysisRoutes } from "./routes/analysis.js";
import { authRoutes } from "./routes/auth.js";
import { exportRoutes } from "./routes/export.js";
import { settingsRoutes } from "./routes/settings.js";
import { toolRoutes } from "./routes/tools.js";
import { workspaceRoutes } from "./routes/workspace.js";
import { registerTool } from "./tools/registry.js";
import { csvProfile } from "./tools/executors/csv-profile.js";
import { bashExecute } from "./tools/executors/bash-executor.js";
import { libraryItemExecute } from "./tools/executors/library-item-executor.js";
import { notifyExecute } from "./tools/executors/notify.js";
import { runAllPersonaSummaries } from "./store.js";

// Register tool executors so agent can actually execute tools
registerTool("tool-csv-profile", csvProfile);
registerTool("tool-bash", bashExecute);
registerTool("tool-create-library-item", libraryItemExecute);
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

app.get("/health", async () => ({
  ok: true,
  service: "enterprise-flow-hub-backend",
}));

await app.register(analysisRoutes);
await app.register(authRoutes);
await app.register(exportRoutes);
await app.register(settingsRoutes);
await app.register(toolRoutes);
await app.register(workspaceRoutes);

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

await app.listen({ port, host });

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
