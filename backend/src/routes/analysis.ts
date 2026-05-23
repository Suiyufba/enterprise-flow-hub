import type { FastifyInstance } from "fastify";
import { AnalysisRequestSchema } from "shared";
import { generateMockAnalysis } from "../ai/mock.js";
import { saveAnalysis, getAnalysis } from "../store.js";

export async function analysisRoutes(app: FastifyInstance) {
  app.post("/analysis", async (request, reply) => {
    const parseResult = AnalysisRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.flatten() });
    }
    const result = generateMockAnalysis(parseResult.data);
    saveAnalysis(result);
    return reply.status(201).send(result);
  });

  app.get("/analysis/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = getAnalysis(id);
    if (!result) {
      return reply.status(404).send({ error: "Analysis not found" });
    }
    return result;
  });
}
