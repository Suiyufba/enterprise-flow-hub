import type { FastifyInstance } from "fastify";
import {
  CreateAutomationRequestSchema,
  CreateLibraryItemRequestSchema,
  CreateProjectRequestSchema,
} from "shared";
import {
  createAutomation,
  createLibraryItem,
  createProject,
  getProject,
  getWorkspace,
  setAutomationEnabled,
  setPluginEnabled,
} from "../store.js";

export async function workspaceRoutes(app: FastifyInstance) {
  app.get("/workspace", async () => getWorkspace());

  app.get("/projects/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const workspace = getWorkspace();
    const project = getProject(id);
    if (!project) {
      return reply.status(404).send({ error: "Project not found" });
    }
    return {
      project,
      enterprise: workspace.enterprises.find((item) => item.id === project.enterpriseId),
      conversations: workspace.conversations.filter((item) => item.projectId === id),
      libraryItems: workspace.libraryItems.filter((item) => item.projectId === id),
      automations: workspace.automations.filter((item) => item.projectId === id),
    };
  });

  app.post("/projects", async (request, reply) => {
    const parsed = CreateProjectRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    return reply.status(201).send(createProject(parsed.data));
  });

  app.post("/library", async (request, reply) => {
    const parsed = CreateLibraryItemRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const item = createLibraryItem(parsed.data);
    if (!item) {
      return reply.status(404).send({ error: "Project not found" });
    }
    return reply.status(201).send(item);
  });

  app.patch("/plugins/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { enabled } = request.body as { enabled?: boolean };
    if (typeof enabled !== "boolean") {
      return reply.status(400).send({ error: "enabled must be boolean" });
    }
    const plugin = setPluginEnabled(id, enabled);
    if (!plugin) {
      return reply.status(404).send({ error: "Plugin not found" });
    }
    return plugin;
  });

  app.post("/automations", async (request, reply) => {
    const parsed = CreateAutomationRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const automation = createAutomation(parsed.data);
    if (!automation) {
      return reply.status(404).send({ error: "Project not found" });
    }
    return reply.status(201).send(automation);
  });

  app.patch("/automations/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { enabled } = request.body as { enabled?: boolean };
    if (typeof enabled !== "boolean") {
      return reply.status(400).send({ error: "enabled must be boolean" });
    }
    const automation = setAutomationEnabled(id, enabled);
    if (!automation) {
      return reply.status(404).send({ error: "Automation not found" });
    }
    return automation;
  });
}
