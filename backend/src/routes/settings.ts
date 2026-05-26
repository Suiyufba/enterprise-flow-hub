import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { aiChat } from "../ai/client.js";
import {
  createPersona,
  createProvider,
  deletePersona,
  deleteProvider,
  fetchProviderModels,
  listAllPersonas,
  listPersonas,
  listProviders,
  testProviderConnection,
  updatePersona,
  updateProvider,
} from "../store.js";

const CreateProviderSchema = z.object({
  name: z.string().min(1).max(60),
  baseUrl: z.string().min(1).max(200),
  model: z.string().min(1).max(60),
  apiKey: z.string().min(1).max(200),
});

const UpdateProviderSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  baseUrl: z.string().min(1).max(200).optional(),
  model: z.string().min(1).max(60).optional(),
  apiKey: z.string().min(1).max(200).optional(),
  enabled: z.boolean().optional(),
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

const FetchModelsSchema = z.object({
  baseUrl: z.string().min(1).max(200),
  apiKey: z.string().min(1).max(200),
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

  app.patch("/settings/providers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateProviderSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const provider = updateProvider(id, parsed.data);
    if (!provider) return reply.status(404).send({ error: "Provider not found" });
    return provider;
  });

  app.post("/settings/fetch-models", async (request, reply) => {
    const parsed = FetchModelsSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    try {
      const res = await fetch(`${parsed.data.baseUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${parsed.data.apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const text = await res.text();
        return reply.status(502).send({ error: `HTTP ${res.status}: ${text.slice(0, 200)}` });
      }
      const data = (await res.json()) as { data?: Array<{ id: string }> };
      return { models: (data.data ?? []).map((m) => m.id).sort() };
    } catch (e) {
      return reply.status(502).send({ error: e instanceof Error ? e.message : "获取模型列表失败" });
    }
  });

  app.post("/settings/providers/:id/fetch-models", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const models = await fetchProviderModels(id);
      return { models };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "获取模型列表失败";
      const status = msg === "Provider not found" ? 404 : msg.includes("no API key") ? 400 : 502;
      return reply.status(status).send({ error: msg });
    }
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
