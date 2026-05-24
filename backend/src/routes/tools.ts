import type { FastifyInstance } from "fastify";
import { RunToolRequestSchema, ToolDefinitionSchema } from "shared";
import { getTool, listRecentToolRuns, listTools, runTool, setToolStatus } from "../store.js";

export async function toolRoutes(app: FastifyInstance) {
  app.get("/tools", async () => ({
    tools: listTools(),
    recentRuns: listRecentToolRuns(),
  }));

  app.get("/tools/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const tool = getTool(id);
    if (!tool) {
      return reply.status(404).send({ error: "Tool not found" });
    }
    return tool;
  });

  app.patch("/tools/:id", async (request, reply) => {
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
    const result = runTool(id, parsed.data);
    if (!result) {
      return reply.status(404).send({ error: "Tool not found" });
    }
    return reply.status(201).send(result);
  });
}
