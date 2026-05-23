import Fastify from "fastify";
import cors from "@fastify/cors";
import { analysisRoutes } from "./routes/analysis.js";
import { exportRoutes } from "./routes/export.js";
import { workspaceRoutes } from "./routes/workspace.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

app.get("/health", async () => ({
  ok: true,
  service: "enterprise-flow-hub-backend",
}));

await app.register(analysisRoutes);
await app.register(exportRoutes);
await app.register(workspaceRoutes);

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

await app.listen({ port, host });
