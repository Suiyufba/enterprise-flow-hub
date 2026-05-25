import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { runAgentKernel, type AgentRuntimeProvider } from "./agent/kernel.js";
import { aiChat } from "./ai/client.js";
import { getExecutor } from "./tools/registry.js";
import type {
  AddMessageRequest,
  AgentPersona,
  AgentSkill,
  AnalysisResult,
  Automation,
  Conversation,
  ConversationDetail,
  CreateAutomationRequest,
  CreateConversationRequest,
  CreateLibraryItemRequest,
  CreateProjectRequest,
  CreateSkillRequest,
  Enterprise,
  LibraryItem,
  LoginRequest,
  Message,
  ModelProvider,
  Plugin,
  Project,
  RegisterUserRequest,
  RunToolRequest,
  ToolDefinition,
  ToolRun,
  UpdateConversationRequest,
  UpdateLibraryItemRequest,
  UpdateProjectRequest,
  UpdateSkillRequest,
  User,
  Workspace,
} from "shared";
import { getDb } from "./db/index.js";

function db() {
  return getDb();
}

function jsonParse<T>(val: string | undefined | null, fallback: T): T {
  if (!val) return fallback;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}

// ---- Analysis ----

export function saveAnalysis(analysis: AnalysisResult): void {
  db()
    .prepare(
      `INSERT OR REPLACE INTO analysis_results
       (id, summary, screenshot_types, business_objects, fields, workflow_stages,
        problems, automation_rules, dashboard_metrics, implementation_plan, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      analysis.id,
      analysis.summary,
      JSON.stringify(analysis.screenshotTypes),
      JSON.stringify(analysis.businessObjects),
      JSON.stringify(analysis.fields),
      JSON.stringify(analysis.workflowStages),
      JSON.stringify(analysis.problems),
      JSON.stringify(analysis.automationRules),
      JSON.stringify(analysis.dashboardMetrics),
      JSON.stringify(analysis.implementationPlan),
      analysis.createdAt,
    );
}

export function getAnalysis(id: string): AnalysisResult | undefined {
  const row = db().prepare("SELECT * FROM analysis_results WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  return {
    id: row.id as string,
    summary: row.summary as string,
    screenshotTypes: jsonParse<string[]>(row.screenshot_types as string, []),
    businessObjects: jsonParse<string[]>(row.business_objects as string, []),
    fields: jsonParse(row.fields as string, []),
    workflowStages: jsonParse<string[]>(row.workflow_stages as string, []),
    problems: jsonParse<string[]>(row.problems as string, []),
    automationRules: jsonParse(row.automation_rules as string, []),
    dashboardMetrics: jsonParse<string[]>(row.dashboard_metrics as string, []),
    implementationPlan: jsonParse<string[]>(row.implementation_plan as string, []),
    createdAt: row.created_at as string,
  };
}

// ---- Enterprise & Project ----

function rowToEnterprise(r: Record<string, unknown>): Enterprise {
  return { id: r.id as string, name: r.name as string };
}

function rowToProject(r: Record<string, unknown>): Project {
  return {
    id: r.id as string,
    enterpriseId: r.enterprise_id as string,
    name: r.name as string,
    description: (r.description as string) || undefined,
    createdAt: r.created_at as string,
  };
}

export function getProject(id: string): Project | undefined {
  const row = db().prepare("SELECT * FROM projects WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToProject(row) : undefined;
}

export function createProject(input: CreateProjectRequest): Project {
  let enterprise = input.enterpriseId
    ? (db().prepare("SELECT * FROM enterprises WHERE id = ?").get(input.enterpriseId) as Record<string, unknown> | undefined)
    : undefined;

  if (!enterprise) {
    const name = input.enterpriseName?.trim() || "新企业";
    const id = `ent-${randomUUID()}`;
    db().prepare("INSERT INTO enterprises (id, name) VALUES (?, ?)").run(id, name);
    enterprise = { id, name };
  }

  const project: Project = {
    id: `proj-${randomUUID()}`,
    enterpriseId: enterprise.id as string,
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };

  db()
    .prepare("INSERT INTO projects (id, enterprise_id, name, description, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(project.id, project.enterpriseId, project.name, project.description ?? null, project.createdAt);

  return project;
}

export function updateProject(id: string, input: UpdateProjectRequest): Project | undefined {
  const existing = getProject(id);
  if (!existing) return undefined;

  const name = input.name ?? existing.name;
  const description = input.description !== undefined ? input.description : existing.description;

  db()
    .prepare("UPDATE projects SET name = ?, description = ? WHERE id = ?")
    .run(name, description ?? null, id);

  return { ...existing, name, description: description || undefined };
}

export function deleteProject(id: string): boolean {
  const result = db().prepare("DELETE FROM projects WHERE id = ?").run(id);
  return result.changes > 0;
}

// ---- Users ----

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  const check = scryptSync(password, salt, 64).toString("hex");
  return check === hash;
}

function rowToUser(r: Record<string, unknown>): User {
  return {
    id: r.id as string,
    enterpriseId: r.enterprise_id as string,
    username: r.username as string,
    displayName: r.display_name as string,
    role: r.role as User["role"],
    createdAt: r.created_at as string,
  };
}

export function registerUser(input: RegisterUserRequest): User | undefined {
  const enterprise = db().prepare("SELECT id FROM enterprises WHERE id = ?").get(input.enterpriseId);
  if (!enterprise) return undefined;

  const existing = db().prepare("SELECT id FROM users WHERE username = ?").get(input.username);
  if (existing) return undefined;

  const user: User = {
    id: `user-${randomUUID()}`,
    enterpriseId: input.enterpriseId,
    username: input.username.trim(),
    displayName: input.displayName.trim(),
    role: "member",
    createdAt: new Date().toISOString(),
  };

  db()
    .prepare("INSERT INTO users (id, enterprise_id, username, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(user.id, user.enterpriseId, user.username, hashPassword(input.password), user.displayName, user.role, user.createdAt);

  return user;
}

export function loginUser(input: LoginRequest): User | undefined {
  const row = db()
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(input.username.trim()) as Record<string, unknown> | undefined;
  if (!row) return undefined;

  const valid = verifyPassword(input.password, row.password_hash as string);
  if (!valid) return undefined;

  return rowToUser(row);
}

export function listUsers(enterpriseId?: string): User[] {
  if (enterpriseId) {
    return (db().prepare("SELECT * FROM users WHERE enterprise_id = ? ORDER BY created_at ASC").all(enterpriseId) as Record<string, unknown>[]).map(rowToUser);
  }
  return (db().prepare("SELECT * FROM users ORDER BY enterprise_id, created_at ASC").all() as Record<string, unknown>[]).map(rowToUser);
}

export function getUser(id: string): User | undefined {
  const row = db().prepare("SELECT * FROM users WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToUser(row) : undefined;
}

export function deleteUser(id: string): boolean {
  const result = db().prepare("DELETE FROM users WHERE id = ?").run(id);
  return result.changes > 0;
}

// ---- Library Items ----

function rowToLibraryItem(r: Record<string, unknown>): LibraryItem {
  return {
    id: r.id as string,
    enterpriseId: r.enterprise_id as string,
    projectId: r.project_id as string,
    name: r.name as string,
    type: r.type as LibraryItem["type"],
    summary: r.summary as string,
    visibility: r.visibility as LibraryItem["visibility"],
    createdAt: r.created_at as string,
  };
}

export function createLibraryItem(input: CreateLibraryItemRequest): LibraryItem | undefined {
  if (!getProject(input.projectId)) return undefined;

  const item: LibraryItem = {
    id: `lib-${randomUUID()}`,
    enterpriseId: input.enterpriseId,
    projectId: input.projectId,
    name: input.name.trim(),
    type: input.type,
    summary: input.summary.trim(),
    visibility: input.visibility,
    createdAt: new Date().toISOString(),
  };

  db()
    .prepare(
      `INSERT INTO library_items (id, enterprise_id, project_id, name, type, summary, visibility, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(item.id, item.enterpriseId, item.projectId, item.name, item.type, item.summary, item.visibility, item.createdAt);

  return item;
}

export function updateLibraryItem(id: string, input: UpdateLibraryItemRequest): LibraryItem | undefined {
  const row = db().prepare("SELECT * FROM library_items WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return undefined;

  const current = rowToLibraryItem(row);
  const name = input.name ?? current.name;
  const type = input.type ?? current.type;
  const summary = input.summary ?? current.summary;
  const visibility = input.visibility ?? current.visibility;

  db()
    .prepare("UPDATE library_items SET name = ?, type = ?, summary = ?, visibility = ? WHERE id = ?")
    .run(name, type, summary, visibility, id);

  return { ...current, name, type, summary, visibility };
}

export function deleteLibraryItem(id: string): boolean {
  const result = db().prepare("DELETE FROM library_items WHERE id = ?").run(id);
  return result.changes > 0;
}

// ---- Plugins ----

function rowToPlugin(r: Record<string, unknown>): Plugin {
  return {
    id: r.id as string,
    name: r.name as string,
    description: r.description as string,
    enabled: (r.enabled as number) === 1,
  };
}

export function setPluginEnabled(id: string, enabled: boolean): Plugin | undefined {
  const row = db().prepare("SELECT * FROM plugins WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  db().prepare("UPDATE plugins SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
  return { ...rowToPlugin(row), enabled };
}

// ---- Automations ----

function rowToAutomation(r: Record<string, unknown>): Automation {
  return {
    id: r.id as string,
    projectId: r.project_id as string,
    name: r.name as string,
    trigger: r.trigger_desc as string,
    triggerType: r.trigger_type as Automation["triggerType"],
    action: r.action_desc as string,
    actionType: r.action_type as Automation["actionType"],
    agentModel: (r.agent_model as string) || undefined,
    systemPrompt: (r.system_prompt as string) || undefined,
    enabled: (r.enabled as number) === 1,
    runCount: r.run_count as number,
    lastRun: (r.last_run as string) || undefined,
  };
}

export function createAutomation(input: CreateAutomationRequest): Automation | undefined {
  if (!getProject(input.projectId)) return undefined;

  const automation: Automation = {
    id: `auto-${randomUUID()}`,
    projectId: input.projectId,
    name: input.name.trim(),
    trigger: input.trigger.trim(),
    triggerType: input.triggerType,
    action: input.action.trim(),
    actionType: input.actionType,
    agentModel: input.agentModel?.trim() || undefined,
    systemPrompt: input.systemPrompt?.trim() || undefined,
    enabled: true,
    runCount: 0,
  };

  db()
    .prepare(
      `INSERT INTO automations
       (id, project_id, name, trigger_desc, trigger_type, action_desc, action_type, agent_model, system_prompt, enabled, run_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      automation.id, automation.projectId, automation.name,
      automation.trigger, automation.triggerType,
      automation.action, automation.actionType,
      automation.agentModel ?? null, automation.systemPrompt ?? null,
      1, 0,
    );

  return automation;
}

export function setAutomationEnabled(id: string, enabled: boolean): Automation | undefined {
  const row = db().prepare("SELECT * FROM automations WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  db().prepare("UPDATE automations SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
  return { ...rowToAutomation(row), enabled };
}

export function deleteAutomation(id: string): boolean {
  const result = db().prepare("DELETE FROM automations WHERE id = ?").run(id);
  return result.changes > 0;
}

// ---- AI Tool Registry ----

function rowToTool(r: Record<string, unknown>): ToolDefinition {
  return {
    id: r.id as string,
    name: r.name as string,
    description: r.description as string,
    kind: r.kind as ToolDefinition["kind"],
    status: r.status as ToolDefinition["status"],
    risk: r.risk as ToolDefinition["risk"],
    inputSchema: r.input_schema as string,
    examplePrompt: r.example_prompt as string,
    createdAt: r.created_at as string,
  };
}

function rowToToolRun(r: Record<string, unknown>): ToolRun {
  return {
    id: r.id as string,
    toolId: r.tool_id as string,
    status: r.status as ToolRun["status"],
    input: jsonParse<Record<string, unknown>>(r.input as string, {}),
    output: r.output as string,
    createdAt: r.created_at as string,
  };
}

export function listTools(): ToolDefinition[] {
  return (db().prepare("SELECT * FROM ai_tools ORDER BY kind, id").all() as Record<string, unknown>[]).map(rowToTool);
}

export function listRecentToolRuns(limit = 12): ToolRun[] {
  return (
    db()
      .prepare("SELECT * FROM tool_runs ORDER BY created_at DESC LIMIT ?")
      .all(limit) as Record<string, unknown>[]
  ).map(rowToToolRun);
}

export function getTool(id: string): ToolDefinition | undefined {
  const row = db().prepare("SELECT * FROM ai_tools WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToTool(row) : undefined;
}

export function setToolStatus(id: string, status: ToolDefinition["status"]): ToolDefinition | undefined {
  const tool = getTool(id);
  if (!tool) return undefined;
  db().prepare("UPDATE ai_tools SET status = ? WHERE id = ?").run(status, id);
  return { ...tool, status };
}

async function simulateToolOutput(tool: ToolDefinition, input: Record<string, unknown>, dryRun: boolean): Promise<string> {
  const mode = dryRun ? "dry-run" : "live";

  // Try real executor first (live mode)
  if (!dryRun) {
    const executor = getExecutor(tool.id);
    if (executor) {
      try {
        const output = await executor(input);
        return output;
      } catch (e) {
        return JSON.stringify({ error: e instanceof Error ? e.message : "Executor failed" });
      }
    }
  }

  // Fallback: AI-simulated output
  try {
    const prompt = typeof input.prompt === "string" ? input.prompt : JSON.stringify(input);
    const result = await aiChat({
      systemPrompt: `你是工具执行 Agent，负责模拟工具 ${tool.name}（${tool.kind}）的执行结果。根据用户输入给出具体、有用的输出，不要只说"已执行"。
工具描述：${tool.description}
示例提示：${tool.examplePrompt}`,
      userMessage: prompt,
      temperature: 0.5,
      maxTokens: 1024,
    });
    return `[${mode}] ${result}`;
  } catch {
    if (tool.kind === "cli") {
      return `[${mode}] CLI adapter would run a sandboxed parser for ${tool.name}.`;
    }
    if (tool.kind === "mcp") {
      return `[${mode}] MCP adapter would expose scoped enterprise context through tool ${tool.id}.`;
    }
    if (tool.kind === "browser") {
      return `[${mode}] Browser adapter would open the target page and return structured observations.`;
    }
    return `[${mode}] HTTP adapter would call a configured webhook with a signed payload.`;
  }
}

export async function runTool(toolId: string, input: RunToolRequest): Promise<ToolRun | undefined> {
  const tool = getTool(toolId);
  if (!tool) return undefined;

  const id = `run-${randomUUID()}`;
  const createdAt = new Date().toISOString();
  const dryRun = input.dryRun ?? true;
  const status: ToolRun["status"] = tool.status === "disabled" ? "error" : "success";
  const output = tool.status === "disabled"
    ? `Tool ${tool.name} is disabled.`
    : await simulateToolOutput(tool, input.input, dryRun);

  db()
    .prepare("INSERT INTO tool_runs (id, tool_id, status, input, output, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, toolId, status, JSON.stringify(input.input), output, createdAt);

  return { id, toolId, status, input: input.input, output, createdAt };
}

// ---- Agent Skills, Personas & Providers ----

function rowToSkill(r: Record<string, unknown>): AgentSkill {
  return {
    id: r.id as string,
    name: r.name as string,
    description: r.description as string,
    toolIds: jsonParse<string[]>(r.tool_ids as string, []),
    prompt: r.prompt as string,
    enabled: (r.enabled as number) === 1,
    createdAt: r.created_at as string,
  };
}

function rowToPersona(r: Record<string, unknown>): AgentPersona {
  return {
    id: r.id as string,
    name: r.name as string,
    role: r.role as string,
    description: r.description as string,
    systemPrompt: r.system_prompt as string,
    defaultSkillIds: jsonParse<string[]>(r.default_skill_ids as string, []),
    providerId: r.provider_id as string,
    enabled: (r.enabled as number) === 1,
  };
}

function rowToProvider(r: Record<string, unknown>): ModelProvider {
  const keyName = r.api_key_env as string;
  return {
    id: r.id as string,
    name: r.name as string,
    baseUrl: r.base_url as string,
    model: r.model as string,
    configured: Boolean(process.env[keyName]),
    enabled: (r.enabled as number) === 1,
  };
}

function rowToRuntimeProvider(r: Record<string, unknown>): AgentRuntimeProvider {
  return {
    ...rowToProvider(r),
    apiKeyEnv: r.api_key_env as string,
  };
}

export function listSkills(): AgentSkill[] {
  return (db().prepare("SELECT * FROM agent_skills ORDER BY enabled DESC, created_at ASC").all() as Record<string, unknown>[]).map(rowToSkill);
}

export function createSkill(input: CreateSkillRequest): AgentSkill {
  const skill: AgentSkill = {
    id: `skill-${randomUUID()}`,
    name: input.name.trim(),
    description: input.description.trim(),
    toolIds: input.toolIds,
    prompt: input.prompt.trim(),
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  db()
    .prepare("INSERT INTO agent_skills (id, name, description, tool_ids, prompt, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(skill.id, skill.name, skill.description, JSON.stringify(skill.toolIds), skill.prompt, 1, skill.createdAt);
  return skill;
}

export function updateSkill(id: string, input: UpdateSkillRequest): AgentSkill | undefined {
  const row = db().prepare("SELECT * FROM agent_skills WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  const current = rowToSkill(row);
  const next: AgentSkill = {
    ...current,
    name: input.name ?? current.name,
    description: input.description ?? current.description,
    toolIds: input.toolIds ?? current.toolIds,
    prompt: input.prompt ?? current.prompt,
    enabled: input.enabled ?? current.enabled,
  };
  db()
    .prepare("UPDATE agent_skills SET name = ?, description = ?, tool_ids = ?, prompt = ?, enabled = ? WHERE id = ?")
    .run(next.name, next.description, JSON.stringify(next.toolIds), next.prompt, next.enabled ? 1 : 0, id);
  return next;
}

export function listPersonas(): AgentPersona[] {
  return (
    db()
      .prepare(
        `SELECT * FROM agent_personas
         WHERE enabled = 1
         ORDER BY CASE id
           WHEN 'persona-ops-cto' THEN 0
           WHEN 'persona-growth-ops' THEN 1
           ELSE 2
         END, id`,
      )
      .all() as Record<string, unknown>[]
  ).map(rowToPersona);
}

export function listProviders(): ModelProvider[] {
  return (db().prepare("SELECT * FROM model_providers ORDER BY id").all() as Record<string, unknown>[]).map(rowToProvider);
}

function getRuntimeProvider(id?: string): AgentRuntimeProvider | undefined {
  const row = id
    ? db().prepare("SELECT * FROM model_providers WHERE id = ? AND enabled = 1").get(id)
    : db().prepare("SELECT * FROM model_providers WHERE enabled = 1 ORDER BY id LIMIT 1").get();
  return row ? rowToRuntimeProvider(row as Record<string, unknown>) : undefined;
}

export function createProvider(input: { name: string; baseUrl: string; model: string; apiKeyEnv: string }): ModelProvider {
  const id = `provider-${randomUUID()}`;
  db()
    .prepare("INSERT INTO model_providers (id, name, base_url, model, api_key_env, enabled) VALUES (?, ?, ?, ?, ?, 1)")
    .run(id, input.name.trim(), input.baseUrl.trim(), input.model.trim(), input.apiKeyEnv.trim());
  return rowToProvider(db().prepare("SELECT * FROM model_providers WHERE id = ?").get(id) as Record<string, unknown>);
}

export function deleteProvider(id: string): boolean {
  const result = db().prepare("DELETE FROM model_providers WHERE id = ?").run(id);
  return result.changes > 0;
}

export async function testProviderConnection(id: string): Promise<{ ok: boolean; message: string }> {
  const provider = db().prepare("SELECT * FROM model_providers WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!provider) return { ok: false, message: "Provider not found" };
  const apiKey = process.env[provider.api_key_env as string];
  if (!apiKey) return { ok: false, message: `环境变量 ${provider.api_key_env} 未配置` };
  try {
    const res = await fetch(`${provider.base_url}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: provider.model, messages: [{ role: "user", content: "hi" }], max_tokens: 5 }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) return { ok: true, message: "连接成功" };
    const text = await res.text();
    return { ok: false, message: `HTTP ${res.status}: ${text.slice(0, 150)}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "连接失败" };
  }
}

export function createPersona(input: { name: string; role: string; description: string; systemPrompt: string; providerId: string }): AgentPersona {
  const id = `persona-${randomUUID()}`;
  db()
    .prepare("INSERT INTO agent_personas (id, name, role, description, system_prompt, default_skill_ids, provider_id, enabled) VALUES (?, ?, ?, ?, ?, '[]', ?, 1)")
    .run(id, input.name.trim(), input.role.trim(), input.description.trim(), input.systemPrompt.trim(), input.providerId);
  return rowToPersona(db().prepare("SELECT * FROM agent_personas WHERE id = ?").get(id) as Record<string, unknown>);
}

export function updatePersona(id: string, input: { name?: string; role?: string; description?: string; systemPrompt?: string; providerId?: string; enabled?: boolean }): AgentPersona | undefined {
  const row = db().prepare("SELECT * FROM agent_personas WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  const current = rowToPersona(row);
  const next: Record<string, unknown> = {
    name: input.name ?? current.name,
    role: input.role ?? current.role,
    description: input.description ?? current.description,
    system_prompt: input.systemPrompt ?? current.systemPrompt,
    provider_id: input.providerId ?? current.providerId,
    enabled: input.enabled !== undefined ? (input.enabled ? 1 : 0) : (current.enabled ? 1 : 0),
  };
  db()
    .prepare("UPDATE agent_personas SET name=?, role=?, description=?, system_prompt=?, provider_id=?, enabled=? WHERE id=?")
    .run(next.name, next.role, next.description, next.system_prompt, next.provider_id, next.enabled, id);
  return rowToPersona(db().prepare("SELECT * FROM agent_personas WHERE id = ?").get(id) as Record<string, unknown>);
}

export function deletePersona(id: string): boolean {
  const result = db().prepare("DELETE FROM agent_personas WHERE id = ?").run(id);
  return result.changes > 0;
}

export function listAllPersonas(): AgentPersona[] {
  return (db().prepare("SELECT * FROM agent_personas ORDER BY enabled DESC, id").all() as Record<string, unknown>[]).map(rowToPersona);
}

// ---- Conversations ----

function rowToConversation(r: Record<string, unknown>): Conversation {
  return {
    id: r.id as string,
    enterpriseId: r.enterprise_id as string,
    projectId: r.project_id as string,
    title: r.title as string,
    tags: jsonParse<string[]>(r.tags as string, []),
    createdAt: r.created_at as string,
  };
}

function rowToMessage(r: Record<string, unknown>): Message {
  return {
    id: r.id as string,
    role: r.role as "user" | "assistant",
    content: r.content as string,
    createdAt: r.created_at as string,
  };
}

export function getConversation(id: string): ConversationDetail | undefined {
  const conv = db().prepare("SELECT * FROM conversations WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!conv) return undefined;
  const messages = db()
    .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC")
    .all(id) as Record<string, unknown>[];
  return {
    ...rowToConversation(conv),
    messages: messages.map(rowToMessage),
  };
}

export function createConversation(input: CreateConversationRequest): ConversationDetail {
  const conversation: Conversation = {
    id: `chat-${randomUUID()}`,
    enterpriseId: input.enterpriseId,
    projectId: input.projectId,
    title: input.title.trim(),
    tags: [],
    createdAt: new Date().toISOString(),
  };

  db()
    .prepare(
      `INSERT INTO conversations (id, enterprise_id, project_id, title, tags, created_at)
       VALUES (?, ?, ?, ?, '[]', ?)`,
    )
    .run(conversation.id, conversation.enterpriseId, conversation.projectId, conversation.title, conversation.createdAt);

  return { ...conversation, messages: [] };
}

export function updateConversation(id: string, input: UpdateConversationRequest): ConversationDetail | undefined {
  const conv = db().prepare("SELECT * FROM conversations WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!conv) return undefined;

  const current = rowToConversation(conv);
  const projectId = input.projectId ?? current.projectId;
  const title = input.title ?? current.title;
  const tags = input.tags ?? current.tags;

  db()
    .prepare("UPDATE conversations SET project_id = ?, title = ?, tags = ? WHERE id = ?")
    .run(projectId, title, JSON.stringify(tags), id);

  const messages = db()
    .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC")
    .all(id) as Record<string, unknown>[];

  return {
    id: current.id,
    enterpriseId: current.enterpriseId,
    projectId,
    title,
    tags,
    createdAt: current.createdAt,
    messages: messages.map(rowToMessage),
  };
}

export function deleteConversation(id: string): boolean {
  const result = db().prepare("DELETE FROM conversations WHERE id = ?").run(id);
  return result.changes > 0;
}

function buildProjectContext(enterpriseId: string, projectIds: string[]): string {
  const placeholders = projectIds.map(() => "?").join(",");
  if (!placeholders) return "";

  const projects = db()
    .prepare(`SELECT * FROM projects WHERE enterprise_id = ? AND id IN (${placeholders}) ORDER BY created_at ASC`)
    .all(enterpriseId, ...projectIds) as Record<string, unknown>[];
  const allowedProjectIds = projects.map((project) => project.id as string);
  if (allowedProjectIds.length === 0) return "";

  const allowedPlaceholders = allowedProjectIds.map(() => "?").join(",");
  const libraryItems = db()
    .prepare(`SELECT * FROM library_items WHERE project_id IN (${allowedPlaceholders}) ORDER BY created_at DESC LIMIT 16`)
    .all(...allowedProjectIds) as Record<string, unknown>[];
  const automations = db()
    .prepare(`SELECT * FROM automations WHERE project_id IN (${allowedPlaceholders}) ORDER BY enabled DESC, run_count DESC LIMIT 16`)
    .all(...allowedProjectIds) as Record<string, unknown>[];
  const conversations = db()
    .prepare(`SELECT * FROM conversations WHERE project_id IN (${allowedPlaceholders}) ORDER BY created_at DESC LIMIT 12`)
    .all(...allowedProjectIds) as Record<string, unknown>[];

  const projectLines = projects.map((project) => {
    return `- ${project.name}: ${(project.description as string | null) || "无描述"} (id: ${project.id})`;
  });
  const libraryLines = libraryItems.map((item) => {
    return `- [${item.type}] ${item.name}: ${item.summary}`;
  });
  const automationLines = automations.map((automation) => {
    const enabled = (automation.enabled as number) === 1 ? "enabled" : "disabled";
    return `- ${automation.name} (${enabled}): 当 ${automation.trigger_desc} -> ${automation.action_desc}`;
  });
  const conversationLines = conversations.map((conversation) => {
    return `- ${conversation.title}: tags ${conversation.tags}`;
  });

  return [
    `Projects:\n${projectLines.join("\n") || "- 无"}`,
    `Library:\n${libraryLines.join("\n") || "- 无"}`,
    `Automations:\n${automationLines.join("\n") || "- 无"}`,
    `Recent conversations:\n${conversationLines.join("\n") || "- 无"}`,
  ].join("\n\n");
}

export async function addMessage(conversationId: string, input: AddMessageRequest): Promise<Message | undefined> {
  const conv = db().prepare("SELECT * FROM conversations WHERE id = ?").get(conversationId) as Record<string, unknown> | undefined;
  if (!conv) return undefined;
  const conversation = rowToConversation(conv);

  const userMsg: Message = {
    id: `msg-${randomUUID()}`,
    role: "user",
    content: input.content,
    createdAt: new Date().toISOString(),
  };
  const insertMsg = db().prepare(
    "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  const deleteMsg = db().prepare("DELETE FROM messages WHERE id = ?");

  insertMsg.run(userMsg.id, conversationId, userMsg.role, userMsg.content, userMsg.createdAt);

  const personas = listPersonas();
  const skills = listSkills();
  const tools = listTools();
  const persona = personas.find((item) => item.id === input.personaId) ?? personas[0];
  const selectedSkillIds = input.skillIds?.length ? input.skillIds : persona?.defaultSkillIds ?? [];
  const selectedSkills = skills.filter((item) => selectedSkillIds.includes(item.id));
  const provider = getRuntimeProvider(persona?.providerId) ?? getRuntimeProvider();
  const contextLabel =
    input.contextScope === "selected_projects"
      ? `结合 ${input.contextProjectIds?.length ?? 0} 个指定项目资料`
      : "仅分析当前项目资料";
  const contextProjectIds =
    input.contextScope === "selected_projects" && input.contextProjectIds?.length
      ? input.contextProjectIds
      : [conversation.projectId];
  const projectContext = buildProjectContext(conversation.enterpriseId, contextProjectIds);

  try {
    const historyRows = db()
      .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC")
      .all(conversationId) as Record<string, unknown>[];
    const history = historyRows.map(rowToMessage);

    const result = await runAgentKernel({
      userContent: input.content,
      history,
      persona,
      skills: selectedSkills,
      tools,
      provider,
      context: {
        conversationTitle: conversation.title,
        contextLabel,
        projectContext,
      },
      runTool: (toolId, toolInput, options) =>
        runTool(toolId, {
          input: {
            ...toolInput,
            _agentReason: options.reason,
          },
          dryRun: options.dryRun,
        }),
    });

    const aiReply: Message = {
      id: `msg-${randomUUID()}`,
      role: "assistant",
      content: result.content,
      createdAt: new Date().toISOString(),
    };
    insertMsg.run(aiReply.id, conversationId, aiReply.role, aiReply.content, aiReply.createdAt);

    return aiReply;
  } catch (e) {
    console.error("Agent kernel failed:", e);
    deleteMsg.run(userMsg.id);
    throw e;
  }
}

// ---- Workspace (aggregate query) ----

export function getWorkspace(): Workspace {
  const d = db();

  const enterprises = (d.prepare("SELECT * FROM enterprises ORDER BY id").all() as Record<string, unknown>[]).map(rowToEnterprise);
  const users = listUsers();
  const projects = (d.prepare("SELECT * FROM projects ORDER BY created_at ASC").all() as Record<string, unknown>[]).map(rowToProject);
  const conversations = (d.prepare("SELECT * FROM conversations ORDER BY created_at ASC").all() as Record<string, unknown>[]).map(rowToConversation);
  const libraryItems = (d.prepare("SELECT * FROM library_items ORDER BY created_at ASC").all() as Record<string, unknown>[]).map(rowToLibraryItem);
  const plugins = (d.prepare("SELECT * FROM plugins ORDER BY id").all() as Record<string, unknown>[]).map(rowToPlugin);
  const automations = (d.prepare("SELECT * FROM automations ORDER BY run_count DESC").all() as Record<string, unknown>[]).map(rowToAutomation);
  const tools = listTools();
  const recentToolRuns = listRecentToolRuns();
  const skills = listSkills();
  const personas = listPersonas();
  const providers = listProviders();

  return { enterprises, users, projects, conversations, libraryItems, plugins, automations, tools, recentToolRuns, skills, personas, providers };
}
