import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { aiChat } from "../ai/client.js";
import {
  createPersona,
  createProvider,
  deletePersona,
  deleteProvider,
  listAllPersonas,
  listPersonas,
  listProviders,
  testProviderConnection,
  updatePersona,
} from "../store.js";

const CreateProviderSchema = z.object({
  name: z.string().min(1).max(60),
  baseUrl: z.string().min(1).max(200),
  model: z.string().min(1).max(60),
  apiKey: z.string().min(1).max(200),
});

const CreatePersonaSchema = z.object({
  name: z.string().min(1).max(60),
  role: z.string().min(1).max(60),
  description: z.string().min(1).max(300),
  systemPrompt: z.string().min(1).max(2000),
  providerId: z.string(),
});

const UpdatePersonaSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  role: z.string().min(1).max(60).optional(),
  description: z.string().min(1).max(300).optional(),
  systemPrompt: z.string().min(1).max(2000).optional(),
  providerId: z.string().optional(),
  enabled: z.boolean().optional(),
});

const GeneratePromptSchema = z.object({
  description: z.string().min(1).max(500),
});

export async function settingsRoutes(app: FastifyInstance) {
  // Providers
  app.get("/settings/providers", async () => ({ providers: listProviders() }));

  app.post("/settings/providers", async (request, reply) => {
    const parsed = CreateProviderSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    return reply.status(201).send(createProvider(parsed.data));
  });

  app.delete("/settings/providers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = deleteProvider(id);
    if (!ok) return reply.status(404).send({ error: "Provider not found" });
    return reply.status(204).send();
  });

  app.get("/settings/providers/:id/test", async (request) => {
    const { id } = request.params as { id: string };
    return testProviderConnection(id);
  });

  // Personas
  app.get("/settings/personas", async () => ({ personas: listAllPersonas() }));

  app.post("/settings/personas", async (request, reply) => {
    const parsed = CreatePersonaSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    return reply.status(201).send(createPersona(parsed.data));
  });

  app.patch("/settings/personas/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdatePersonaSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const persona = updatePersona(id, parsed.data);
    if (!persona) return reply.status(404).send({ error: "Persona not found" });
    return persona;
  });

  app.delete("/settings/personas/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = deletePersona(id);
    if (!ok) return reply.status(404).send({ error: "Persona not found" });
    return reply.status(204).send();
  });

  // AI Generate prompt
  app.post("/settings/generate-prompt", async (request, reply) => {
    const parsed = GeneratePromptSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    try {
      const prompt = await aiChat({
        systemPrompt: "你是一位 AI 角色设计专家。用户描述想要的角色类型，你需要生成一段专业的 system prompt。直接输出 prompt 文本，不要加引号或额外说明。",
        userMessage: `为这个角色写一段 system prompt（200-500字）：${parsed.data.description}`,
        temperature: 0.8,
        maxTokens: 1024,
      });
      return { prompt: prompt.trim() };
    } catch {
      return reply.status(502).send({ error: "AI 生成失败，请检查模型配置" });
    }
  });
}
