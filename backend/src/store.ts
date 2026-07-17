import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { runAgentKernel, type AgentRuntimeProvider } from "./agent/kernel.js";
import { getRuntime } from "./agent/runtime.js";
import { getExecutor } from "./tools/registry.js";
import type {
  AddMessageRequest,
  AddMessageResponse,
  AgentPersona,
  AgentPlanStep,
  AgentSkill,
  AnalysisResult,
  Automation,
  AutomationRun,
  Conversation,
  ConversationDetail,
  CreateAutomationRequest,
  CreateConversationRequest,
  CreateDepartmentRequest,
  CreateLibraryItemRequest,
  CreateProjectRequest,
  CreateSkillRequest,
  CreateUserRequest,
  Department,
  Enterprise,
  LibraryItem,
  LoginRequest,
  Message,
  ModelProvider,
  Plugin,
  PluginConfigResponse,
  Project,
  RegisterUserRequest,
  RunToolRequest,
  ToolDefinition,
  ToolRun,
  UpdateConversationRequest,
  UpdateDepartmentRequest,
  UpdateEnterpriseRequest,
  UpdateLibraryItemRequest,
  UpdateProjectRequest,
  UpdateProviderRequest,
  UpdateSkillRequest,
  UpdateUserRequest,
  User,
  Workspace,
} from "shared";
import { getDb } from "./db/index.js";

export function db() {
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
  return { id: r.id as string, name: r.name as string, tags: jsonParse<string[]>(r.tags as string, []) };
}

export function getEnterprise(id: string): Enterprise | undefined {
  const row = db().prepare("SELECT * FROM enterprises WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToEnterprise(row) : undefined;
}

export function updateEnterprise(id: string, input: UpdateEnterpriseRequest): Enterprise | undefined {
  const existing = getEnterprise(id);
  if (!existing) return undefined;
  db().prepare("UPDATE enterprises SET name=?, tags=? WHERE id=?").run(
    input.name ?? existing.name,
    JSON.stringify(input.tags ?? existing.tags),
    id,
  );
  return getEnterprise(id);
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
    enterprise = { id, name, tags: "[]" };
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
    departmentId: (r.department_id as string) || undefined,
    position: (r.position as string) || undefined,
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

export function createUser(input: CreateUserRequest): User | undefined {
  const enterprise = db().prepare("SELECT id FROM enterprises WHERE id = ?").get(input.enterpriseId);
  if (!enterprise) return undefined;

  const existing = db().prepare("SELECT id FROM users WHERE username = ?").get(input.username);
  if (existing) return undefined;

  const user: User = {
    id: `user-${randomUUID()}`,
    enterpriseId: input.enterpriseId,
    username: input.username.trim(),
    displayName: input.displayName.trim(),
    role: input.role ?? "member",
    departmentId: input.departmentId || undefined,
    position: input.position?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };

  db()
    .prepare("INSERT INTO users (id, enterprise_id, username, password_hash, display_name, role, department_id, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(user.id, user.enterpriseId, user.username, hashPassword(input.password), user.displayName, user.role, user.departmentId ?? null, user.position ?? null, user.createdAt);

  return user;
}

export function updateUser(id: string, input: UpdateUserRequest): User | undefined {
  const row = db().prepare("SELECT * FROM users WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  const current = rowToUser(row);

  const displayName = input.displayName ?? current.displayName;
  const role = input.role ?? current.role;
  const departmentId = input.departmentId !== undefined ? (input.departmentId || null) : (current.departmentId ?? null);
  const position = input.position !== undefined ? (input.position || null) : (current.position ?? null);

  db()
    .prepare("UPDATE users SET display_name = ?, role = ?, department_id = ?, position = ? WHERE id = ?")
    .run(displayName, role, departmentId, position, id);

  return rowToUser(db().prepare("SELECT * FROM users WHERE id = ?").get(id) as Record<string, unknown>);
}

// ---- Departments ----

function rowToDepartment(r: Record<string, unknown>): Department {
  return {
    id: r.id as string,
    enterpriseId: r.enterprise_id as string,
    parentId: (r.parent_id as string) || undefined,
    name: r.name as string,
    createdAt: r.created_at as string,
  };
}

export function getDepartment(id: string): Department | undefined {
  const row = db().prepare("SELECT * FROM departments WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToDepartment(row) : undefined;
}

export function listDepartments(enterpriseId: string): Department[] {
  return (db()
    .prepare("SELECT * FROM departments WHERE enterprise_id = ? ORDER BY created_at ASC")
    .all(enterpriseId) as Record<string, unknown>[])
    .map(rowToDepartment);
}

export function createDepartment(input: CreateDepartmentRequest): Department {
  const dept: Department = {
    id: `dept-${randomUUID()}`,
    enterpriseId: input.enterpriseId,
    parentId: input.parentId || undefined,
    name: input.name.trim(),
    createdAt: new Date().toISOString(),
  };
  db()
    .prepare("INSERT INTO departments (id, enterprise_id, parent_id, name, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(dept.id, dept.enterpriseId, dept.parentId ?? null, dept.name, dept.createdAt);
  return dept;
}

export function updateDepartment(id: string, input: UpdateDepartmentRequest): Department | undefined {
  const row = db().prepare("SELECT * FROM departments WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  const current = rowToDepartment(row);
  const name = input.name ?? current.name;
  const parentId = input.parentId !== undefined ? (input.parentId || null) : (current.parentId ?? null);

  db()
    .prepare("UPDATE departments SET name = ?, parent_id = ? WHERE id = ?")
    .run(name, parentId, id);

  return rowToDepartment(db().prepare("SELECT * FROM departments WHERE id = ?").get(id) as Record<string, unknown>);
}

export function deleteDepartment(id: string): boolean {
  // Move children up to this department's parent
  const dept = db().prepare("SELECT * FROM departments WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!dept) return false;
  const parentId = dept.parent_id as string | null;
  db().prepare("UPDATE departments SET parent_id = ? WHERE parent_id = ?").run(parentId, id);
  // Clear department_id for users in this department
  db().prepare("UPDATE users SET department_id = NULL WHERE department_id = ?").run(id);
  const result = db().prepare("DELETE FROM departments WHERE id = ?").run(id);
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

export function getLibraryItem(id: string): LibraryItem | undefined {
  const row = db().prepare("SELECT * FROM library_items WHERE id=?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToLibraryItem(row) : undefined;
}

export function createLibraryItem(input: CreateLibraryItemRequest): LibraryItem | undefined {
  const project = getProject(input.projectId);
  if (!project || project.enterpriseId !== input.enterpriseId) return undefined;

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
  const projectId = input.projectId ?? current.projectId;
  const project = getProject(projectId);
  if (!project) return undefined;
  const enterpriseId = input.enterpriseId ?? project.enterpriseId;
  if (project.enterpriseId !== enterpriseId) return undefined;
  const name = input.name ?? current.name;
  const type = input.type ?? current.type;
  const summary = input.summary ?? current.summary;
  const visibility = input.visibility ?? current.visibility;

  db()
    .prepare("UPDATE library_items SET enterprise_id = ?, project_id = ?, name = ?, type = ?, summary = ?, visibility = ? WHERE id = ?")
    .run(enterpriseId, projectId, name, type, summary, visibility, id);

  return { ...current, enterpriseId, projectId, name, type, summary, visibility };
}

export function deleteLibraryItem(id: string): boolean {
  const result = db().prepare("DELETE FROM library_items WHERE id = ?").run(id);
  return result.changes > 0;
}

// ---- Plugins ----

const pluginRequirements: Record<string, { requiredFields: string[]; hint: string; notification: boolean }> = {
  "plugin-feishu": {
    requiredFields: ["webhookUrl"],
    hint: "填写飞书群自定义机器人的 Webhook 地址，保存后可发送测试消息。",
    notification: true,
  },
  "plugin-wecom": {
    requiredFields: ["webhookUrl"],
    hint: "填写企业微信群机器人的 Webhook 地址，保存后可发送测试消息。",
    notification: true,
  },
};

function getPluginRequirement(id: string) {
  return pluginRequirements[id] ?? { requiredFields: [], hint: "这个插件无需额外绑定。", notification: false };
}

function getPluginConfigFields(id: string): Record<string, string> {
  const row = db().prepare("SELECT config_json FROM plugin_configs WHERE plugin_id = ?").get(id) as Record<string, unknown> | undefined;
  return jsonParse<Record<string, string>>(row?.config_json as string | undefined, {});
}

function isPluginConfigured(id: string): boolean {
  const requirement = getPluginRequirement(id);
  if (requirement.requiredFields.length === 0) return true;
  const fields = getPluginConfigFields(id);
  return requirement.requiredFields.every((field) => Boolean(fields[field]?.trim()));
}

function pluginConfigSummary(id: string): string | undefined {
  const fields = getPluginConfigFields(id);
  if (fields.botId) {
    return `BotID ${fields.botId.slice(0, 24)}`;
  }
  if (fields.webhookUrl) {
    return `Webhook ${fields.webhookUrl.slice(0, 24)}...`;
  }
  if (fields.appId) {
    return `App ${fields.appId}`;
  }
  return undefined;
}

function rowToPlugin(r: Record<string, unknown>): Plugin {
  const id = r.id as string;
  const requirement = getPluginRequirement(id);
  const configured = isPluginConfigured(id);
  return {
    id,
    name: r.name as string,
    description: r.description as string,
    enabled: (r.enabled as number) === 1 && configured,
    configRequired: requirement.requiredFields.length > 0,
    configured,
    configSummary: pluginConfigSummary(id),
  };
}

export function setPluginEnabled(id: string, enabled: boolean): Plugin | undefined {
  const row = db().prepare("SELECT * FROM plugins WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  if (enabled && !isPluginConfigured(id)) {
    throw new Error("Plugin requires configuration before enabling");
  }
  db().prepare("UPDATE plugins SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
  return rowToPlugin({ ...row, enabled: enabled ? 1 : 0 });
}

export function getPluginConfig(id: string): PluginConfigResponse | undefined {
  const row = db().prepare("SELECT * FROM plugins WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  const fields = getPluginConfigFields(id);
  const safeFields = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      /secret|token|key/i.test(key) ? (value ? "********" : "") : value,
    ]),
  );
  const requirement = getPluginRequirement(id);
  return {
    pluginId: id,
    fields: safeFields,
    requiredFields: requirement.requiredFields,
    configured: isPluginConfigured(id),
    hint: requirement.hint,
  };
}

export function updatePluginConfig(id: string, fields: Record<string, string>): PluginConfigResponse | undefined {
  const row = db().prepare("SELECT * FROM plugins WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  const current = getPluginConfigFields(id);
  const next = { ...current };
  for (const [key, value] of Object.entries(fields)) {
    if (value.trim()) {
      next[key] = value.trim();
    } else {
      delete next[key];
    }
  }
  db()
    .prepare(
      `INSERT INTO plugin_configs (plugin_id, config_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(plugin_id) DO UPDATE SET config_json = excluded.config_json, updated_at = excluded.updated_at`,
    )
    .run(id, JSON.stringify(next), new Date().toISOString());
  return getPluginConfig(id);
}

export function listConfiguredNotificationPlugins(): Plugin[] {
  return (db().prepare("SELECT * FROM plugins WHERE enabled = 1 ORDER BY id").all() as Record<string, unknown>[])
    .map(rowToPlugin)
    .filter((plugin) => getPluginRequirement(plugin.id).notification && plugin.configured && plugin.enabled);
}

export function getNotificationWebhook(pluginId?: string): { pluginId: string; url: string; kind: "feishu" | "wecom" } | undefined {
  const candidates = pluginId
    ? [pluginId]
    : listConfiguredNotificationPlugins().map((plugin) => plugin.id);
  for (const id of candidates) {
    const row = db().prepare("SELECT * FROM plugins WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) continue;
    const plugin = rowToPlugin(row);
    if (!plugin.enabled || !getPluginRequirement(id).notification) continue;
    const fields = getPluginConfigFields(id);
    if (fields.webhookUrl?.trim()) {
      return { pluginId: id, url: fields.webhookUrl.trim(), kind: id === "plugin-wecom" ? "wecom" : "feishu" };
    }
  }
  return undefined;
}

function isProviderUsable(id: string): boolean {
  const row = db().prepare("SELECT * FROM model_providers WHERE id = ? AND enabled = 1").get(id) as Record<string, unknown> | undefined;
  if (!row) return false;
  return Boolean(row.api_key_env);
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
    actionPluginId: (r.action_plugin_id as string) || undefined,
    actionToolId: (r.action_tool_id as string) || undefined,
    actionInput: jsonParse<Record<string, unknown>>(r.action_input as string, {}),
    systemPrompt: (r.system_prompt as string) || undefined,
    webhookSecret: (r.webhook_secret as string) || undefined,
    enabled: (r.enabled as number) === 1,
    runCount: r.run_count as number,
    lastRun: (r.last_run as string) || undefined,
    lastStatus: (r.last_status as Automation["lastStatus"]) || undefined,
    lastOutput: (r.last_output as string) || undefined,
    lastError: (r.last_error as string) || undefined,
    lastDurationMs: typeof r.last_duration_ms === "number" ? r.last_duration_ms : undefined,
  };
}

function rowToAutomationRun(r: Record<string, unknown>): AutomationRun {
  return {
    id: r.id as string,
    automationId: r.automation_id as string,
    status: r.status as AutomationRun["status"],
    triggerEvent: jsonParse<Record<string, unknown>>(r.trigger_event as string, {}),
    output: (r.output as string) || "",
    errorMessage: (r.error_message as string) || "",
    durationMs: (r.duration_ms as number) || 0,
    createdAt: r.created_at as string,
  };
}

export function createAutomation(input: CreateAutomationRequest): Automation | undefined {
  if (!getProject(input.projectId)) return undefined;
  if (input.triggerType === "email") throw new Error("邮件触发尚未接入，请改用 Webhook");
  if (!["call_ai", "notify", "tool_call"].includes(input.actionType)) {
    throw new Error("该自动化动作尚未接入执行器");
  }
  if (input.agentModel && !isProviderUsable(input.agentModel)) {
    throw new Error("Selected model account is not configured");
  }
  if (input.actionType === "notify") {
    const pluginId = input.actionPluginId?.trim();
    const available = listConfiguredNotificationPlugins();
    if (!pluginId || !available.some((plugin) => plugin.id === pluginId)) {
      throw new Error("Notification action requires a configured Feishu or WeCom plugin");
    }
  }
  if (input.actionType === "tool_call" && !input.actionToolId?.trim()) {
    throw new Error("Business tool action requires actionToolId");
  }
  if (input.actionType === "tool_call") {
    const tool = getTool(input.actionToolId!);
    if (!tool || tool.status !== "enabled" || tool.risk === "admin" || !getExecutor(tool.id)) {
      throw new Error("Business tool action must reference an enabled tool with an executor");
    }
  }

  const automation: Automation = {
    id: `auto-${randomUUID()}`,
    projectId: input.projectId,
    name: input.name.trim(),
    trigger: input.trigger.trim(),
    triggerType: input.triggerType,
    action: input.action.trim(),
    actionType: input.actionType,
    agentModel: input.agentModel?.trim() || undefined,
    actionPluginId: input.actionPluginId?.trim() || undefined,
    actionToolId: input.actionToolId?.trim() || undefined,
    actionInput: input.actionInput ?? {},
    systemPrompt: input.systemPrompt?.trim() || undefined,
    webhookSecret: input.triggerType === "webhook" ? randomBytes(24).toString("hex") : undefined,
    enabled: true,
    runCount: 0,
  };

  db()
    .prepare(
      `INSERT INTO automations
       (id, project_id, name, trigger_desc, trigger_type, action_desc, action_type, agent_model, action_plugin_id, action_tool_id, action_input, system_prompt, webhook_secret, enabled, run_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      automation.id, automation.projectId, automation.name,
      automation.trigger, automation.triggerType,
      automation.action, automation.actionType,
      automation.agentModel ?? null, automation.actionPluginId ?? null, automation.actionToolId ?? null,
      JSON.stringify(automation.actionInput), automation.systemPrompt ?? null, automation.webhookSecret ?? null,
      1, 0,
    );

  return automation;
}

export function setAutomationEnabled(id: string, enabled: boolean): Automation | undefined {
  const row = db().prepare("SELECT * FROM automations WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  const automation = rowToAutomation(row);
  if (enabled && (automation.triggerType === "email" || !["call_ai", "notify", "tool_call"].includes(automation.actionType))) {
    throw new Error("该旧自动化尚未接入真实执行器，请先编辑后再启用");
  }
  db().prepare("UPDATE automations SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
  return { ...automation, enabled };
}

export function getAutomation(id: string): Automation | undefined {
  const row = db().prepare("SELECT * FROM automations WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToAutomation(row) : undefined;
}

export function updateAutomation(id: string, input: Partial<CreateAutomationRequest> & { enabled?: boolean }): Automation | undefined {
  const row = db().prepare("SELECT * FROM automations WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  const current = rowToAutomation(row);
  const nextAgentModel = input.agentModel !== undefined ? (input.agentModel?.trim() || undefined) : current.agentModel;
  const nextActionType = input.actionType ?? current.actionType;
  const nextTriggerType = input.triggerType ?? current.triggerType;
  if (nextTriggerType === "email") throw new Error("邮件触发尚未接入，请改用 Webhook");
  if (!["call_ai", "notify", "tool_call"].includes(nextActionType)) {
    throw new Error("该自动化动作尚未接入执行器");
  }
  const nextActionPluginId = input.actionPluginId !== undefined ? (input.actionPluginId?.trim() || undefined) : current.actionPluginId;
  const nextActionToolId = input.actionToolId !== undefined ? (input.actionToolId?.trim() || undefined) : current.actionToolId;
  if (nextAgentModel && !isProviderUsable(nextAgentModel)) {
    throw new Error("Selected model account is not configured");
  }
  if (nextActionType === "notify") {
    const available = listConfiguredNotificationPlugins();
    if (!nextActionPluginId || !available.some((plugin) => plugin.id === nextActionPluginId)) {
      throw new Error("Notification action requires a configured Feishu or WeCom plugin");
    }
  }
  if (nextActionType === "tool_call" && !nextActionToolId) {
    throw new Error("Business tool action requires actionToolId");
  }
  if (nextActionType === "tool_call") {
    const tool = getTool(nextActionToolId!);
    if (!tool || tool.status !== "enabled" || tool.risk === "admin" || !getExecutor(tool.id)) {
      throw new Error("Business tool action must reference an enabled tool with an executor");
    }
  }
  const next: Record<string, unknown> = {
    project_id: input.projectId ?? current.projectId,
    name: input.name?.trim() ?? current.name,
    trigger_desc: input.trigger?.trim() ?? current.trigger,
    trigger_type: nextTriggerType,
    action_desc: input.action?.trim() ?? current.action,
    action_type: nextActionType,
    agent_model: nextAgentModel ?? null,
    action_plugin_id: nextActionPluginId ?? null,
    action_tool_id: nextActionToolId ?? null,
    action_input: JSON.stringify(input.actionInput ?? current.actionInput),
    system_prompt: input.systemPrompt !== undefined ? (input.systemPrompt?.trim() || null) : (current.systemPrompt ?? null),
    webhook_secret: nextTriggerType === "webhook"
      ? (current.webhookSecret ?? randomBytes(24).toString("hex"))
      : null,
    enabled: input.enabled !== undefined ? (input.enabled ? 1 : 0) : (current.enabled ? 1 : 0),
  };
  db()
    .prepare("UPDATE automations SET project_id=?, name=?, trigger_desc=?, trigger_type=?, action_desc=?, action_type=?, agent_model=?, action_plugin_id=?, action_tool_id=?, action_input=?, system_prompt=?, webhook_secret=?, enabled=? WHERE id=?")
    .run(next.project_id, next.name, next.trigger_desc, next.trigger_type, next.action_desc, next.action_type, next.agent_model, next.action_plugin_id, next.action_tool_id, next.action_input, next.system_prompt, next.webhook_secret, next.enabled, id);
  return rowToAutomation(db().prepare("SELECT * FROM automations WHERE id = ?").get(id) as Record<string, unknown>);
}

export function deleteAutomation(id: string): boolean {
  const result = db().prepare("DELETE FROM automations WHERE id = ?").run(id);
  return result.changes > 0;
}

export function listEnabledScheduleAutomations(): Automation[] {
  return (
    db()
      .prepare("SELECT * FROM automations WHERE enabled = 1 AND trigger_type = 'schedule' ORDER BY rowid ASC")
      .all() as Record<string, unknown>[]
  ).map(rowToAutomation);
}

export function listEnabledAutomationsByTrigger(triggerType: Automation["triggerType"], projectId?: string): Automation[] {
  const rows = projectId
    ? db()
      .prepare("SELECT * FROM automations WHERE enabled = 1 AND trigger_type = ? AND project_id = ? ORDER BY rowid ASC")
      .all(triggerType, projectId)
    : db()
      .prepare("SELECT * FROM automations WHERE enabled = 1 AND trigger_type = ? ORDER BY rowid ASC")
      .all(triggerType);
  return (rows as Record<string, unknown>[]).map(rowToAutomation);
}

export function recordAutomationRun(
  id: string,
  result: { status: "success" | "error"; event?: Record<string, unknown>; output?: string; error?: string; durationMs: number },
  when = new Date(),
): Automation | undefined {
  const row = db().prepare("SELECT * FROM automations WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return undefined;

  db()
    .prepare(`UPDATE automations
      SET run_count = run_count + ?, last_run = ?, last_status = ?, last_output = ?, last_error = ?, last_duration_ms = ?
      WHERE id = ?`)
    .run(1, when.toISOString(), result.status, result.output ?? "", result.error ?? "", result.durationMs, id);

  db().prepare(
    `INSERT INTO automation_runs (id,automation_id,status,trigger_event,output,error_message,duration_ms,created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).run(
    `arun-${randomUUID()}`, id, result.status, JSON.stringify(result.event ?? {}), result.output ?? "",
    result.error ?? "", result.durationMs, when.toISOString(),
  );

  return rowToAutomation(db().prepare("SELECT * FROM automations WHERE id = ?").get(id) as Record<string, unknown>);
}

export function listRecentAutomationRuns(limit = 30): AutomationRun[] {
  return (db().prepare("SELECT * FROM automation_runs ORDER BY created_at DESC LIMIT ?").all(limit) as Record<string, unknown>[])
    .map(rowToAutomationRun);
}

// ---- AI Tool Registry ----

function rowToTool(r: Record<string, unknown>): ToolDefinition {
  const id = r.id as string;
  const notificationReady = id === "tool-feishu-notify" ? listConfiguredNotificationPlugins().length > 0 : undefined;
  return {
    id,
    name: r.name as string,
    description: r.description as string,
    kind: r.kind as ToolDefinition["kind"],
    status: notificationReady === undefined ? r.status as ToolDefinition["status"] : (notificationReady ? "enabled" : "needs_config"),
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

export function listRecentToolRuns(limit = 12, enterpriseId?: string): ToolRun[] {
  const rows = (
    db()
      .prepare("SELECT * FROM tool_runs ORDER BY created_at DESC LIMIT ?")
      .all(enterpriseId ? Math.max(limit * 10, 100) : limit) as Record<string, unknown>[]
  ).map(rowToToolRun);
  return (enterpriseId ? rows.filter((run) => run.input._enterpriseId === enterpriseId) : rows).slice(0, limit);
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

async function executeToolOutput(tool: ToolDefinition, input: Record<string, unknown>, dryRun: boolean): Promise<string> {
  const executor = getExecutor(tool.id);
  if (!executor) {
    return JSON.stringify({ ok: false, error: `工具 ${tool.name} 尚未接入执行器` });
  }

  if (dryRun && tool.risk !== "read_only") {
    return JSON.stringify({
      ok: true,
      dryRun: true,
      toolId: tool.id,
      message: "预览已通过，未执行任何写入或外部通知",
    });
  }

  try {
    return await executor(input);
  } catch (error) {
    return JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "工具执行失败" });
  }
}

export async function runTool(toolId: string, input: RunToolRequest): Promise<ToolRun | undefined> {
  const tool = getTool(toolId);
  if (!tool) return undefined;

  const id = `run-${randomUUID()}`;
  const createdAt = new Date().toISOString();
  const dryRun = input.dryRun ?? true;
  const output = tool.status === "disabled"
    ? `Tool ${tool.name} is disabled.`
    : await executeToolOutput(tool, input.input, dryRun);
  let status: ToolRun["status"] = tool.status === "disabled" ? "error" : "success";
  if (status === "success") {
    try {
      const parsed = JSON.parse(output) as { ok?: boolean; error?: unknown };
      if (parsed.ok === false || parsed.error) status = "error";
    } catch {
      // Plain text output is a valid success result.
    }
  }

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
    thinkingProviderId: (r.thinking_provider_id as string) || undefined,
    enabled: (r.enabled as number) === 1,
    memory: (r.memory as string) || undefined,
  };
}

function rowToProvider(r: Record<string, unknown>): ModelProvider {
  return {
    id: r.id as string,
    name: r.name as string,
    baseUrl: r.base_url as string,
    model: r.model as string,
    configured: Boolean(r.api_key_env),
    enabled: (r.enabled as number) === 1,
  };
}

function rowToRuntimeProvider(r: Record<string, unknown>): AgentRuntimeProvider {
  return {
    ...rowToProvider(r),
    apiKey: r.api_key_env as string,
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

export function deleteSkill(id: string): boolean {
  const result = db().prepare("DELETE FROM agent_skills WHERE id = ?").run(id);
  return result.changes > 0;
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

export function getRuntimeProvider(id?: string): AgentRuntimeProvider | undefined {
  const row = id
    ? db().prepare("SELECT * FROM model_providers WHERE id = ? AND enabled = 1").get(id)
    : db().prepare("SELECT * FROM model_providers WHERE enabled = 1 ORDER BY id LIMIT 1").get();
  return row ? rowToRuntimeProvider(row as Record<string, unknown>) : undefined;
}

export function createProvider(input: { name: string; baseUrl: string; model: string; apiKey: string }): ModelProvider {
  const id = `provider-${randomUUID()}`;
  db()
    .prepare("INSERT INTO model_providers (id, name, base_url, model, api_key_env, enabled) VALUES (?, ?, ?, ?, ?, 1)")
    .run(id, input.name.trim(), input.baseUrl.trim(), input.model.trim(), input.apiKey.trim());
  return rowToProvider(db().prepare("SELECT * FROM model_providers WHERE id = ?").get(id) as Record<string, unknown>);
}

export function deleteProvider(id: string): boolean {
  const result = db().prepare("DELETE FROM model_providers WHERE id = ?").run(id);
  return result.changes > 0;
}

export function updateProvider(id: string, input: UpdateProviderRequest): ModelProvider | undefined {
  const row = db().prepare("SELECT * FROM model_providers WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  const current = rowToProvider(row);
  const next: Record<string, unknown> = {
    name: input.name ?? current.name,
    base_url: input.baseUrl ?? current.baseUrl,
    model: input.model ?? current.model,
    api_key_env: input.apiKey !== undefined ? input.apiKey : row.api_key_env,
    enabled: input.enabled !== undefined ? (input.enabled ? 1 : 0) : row.enabled,
  };
  db()
    .prepare("UPDATE model_providers SET name=?, base_url=?, model=?, api_key_env=?, enabled=? WHERE id=?")
    .run(next.name, next.base_url, next.model, next.api_key_env, next.enabled, id);
  return rowToProvider(db().prepare("SELECT * FROM model_providers WHERE id = ?").get(id) as Record<string, unknown>);
}

export async function fetchProviderModels(id: string): Promise<string[]> {
  const provider = db().prepare("SELECT * FROM model_providers WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!provider) throw new Error("Provider not found");
  const apiKey = provider.api_key_env as string;
  if (!apiKey) throw new Error("Provider has no API key configured");
  const res = await fetch(`${provider.base_url}/v1/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { data?: Array<{ id: string }> };
  return (data.data ?? []).map((m) => m.id).sort();
}

export async function testProviderConnection(id: string): Promise<{ ok: boolean; message: string }> {
  const provider = db().prepare("SELECT * FROM model_providers WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!provider) return { ok: false, message: "Provider not found" };
  const apiKey = provider.api_key_env as string;
  if (!apiKey) return { ok: false, message: "API Key 未配置" };
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

export function createPersona(input: { name: string; role: string; description: string; systemPrompt: string; providerId: string; thinkingProviderId?: string }): AgentPersona {
  const id = `persona-${randomUUID()}`;
  db()
    .prepare("INSERT INTO agent_personas (id, name, role, description, system_prompt, default_skill_ids, provider_id, thinking_provider_id, enabled) VALUES (?, ?, ?, ?, ?, '[]', ?, ?, 1)")
    .run(id, input.name.trim(), input.role.trim(), input.description.trim(), input.systemPrompt.trim(), input.providerId, input.thinkingProviderId || null);
  return rowToPersona(db().prepare("SELECT * FROM agent_personas WHERE id = ?").get(id) as Record<string, unknown>);
}

export function updatePersona(id: string, input: { name?: string; role?: string; description?: string; systemPrompt?: string; providerId?: string; thinkingProviderId?: string; enabled?: boolean; memory?: string }): AgentPersona | undefined {
  const row = db().prepare("SELECT * FROM agent_personas WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  const current = rowToPersona(row);
  const next: Record<string, unknown> = {
    name: input.name ?? current.name,
    role: input.role ?? current.role,
    description: input.description ?? current.description,
    system_prompt: input.systemPrompt ?? current.systemPrompt,
    provider_id: input.providerId ?? current.providerId,
    thinking_provider_id: input.thinkingProviderId !== undefined ? (input.thinkingProviderId || null) : row.thinking_provider_id,
    memory: input.memory !== undefined ? input.memory : row.memory,
    enabled: input.enabled !== undefined ? (input.enabled ? 1 : 0) : (current.enabled ? 1 : 0),
  };
  db()
    .prepare("UPDATE agent_personas SET name=?, role=?, description=?, system_prompt=?, provider_id=?, thinking_provider_id=?, memory=?, enabled=? WHERE id=?")
    .run(next.name, next.role, next.description, next.system_prompt, next.provider_id, next.thinking_provider_id, next.memory, next.enabled, id);
  return rowToPersona(db().prepare("SELECT * FROM agent_personas WHERE id = ?").get(id) as Record<string, unknown>);
}

export function deletePersona(id: string): boolean {
  const result = db().prepare("DELETE FROM agent_personas WHERE id = ?").run(id);
  return result.changes > 0;
}

export function listAllPersonas(): AgentPersona[] {
  return (db().prepare("SELECT * FROM agent_personas ORDER BY enabled DESC, id").all() as Record<string, unknown>[]).map(rowToPersona);
}

export function updatePersonaMemory(id: string, memory: string): AgentPersona | undefined {
  const row = db().prepare("SELECT * FROM agent_personas WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  db().prepare("UPDATE agent_personas SET memory = ? WHERE id = ?").run(memory, id);
  return rowToPersona(db().prepare("SELECT * FROM agent_personas WHERE id = ?").get(id) as Record<string, unknown>);
}

export async function summarizePersonaMemory(persona: AgentPersona): Promise<void> {
  // Find all conversations where this persona was used
  const personaId = persona.id;
  const conversations = db()
    .prepare("SELECT * FROM conversations ORDER BY created_at DESC LIMIT 20")
    .all() as Record<string, unknown>[];

  const conversationsWithThisPersona: string[] = [];
  for (const conv of conversations) {
    const msgs = db()
      .prepare("SELECT content FROM messages WHERE conversation_id = ? AND role = 'user' ORDER BY created_at DESC LIMIT 5")
      .all(conv.id as string) as Record<string, unknown>[];
    if (msgs.length > 0) {
      conversationsWithThisPersona.push(
        `## ${conv.title}\n${msgs.map((m) => `- ${(m.content as string).slice(0, 100)}`).join("\n")}`,
      );
    }
  }

  if (conversationsWithThisPersona.length === 0) return;

  const existingMemory = persona.memory || "";
  const prompt = [
    "你是 Enterprise Flow Hub 的记忆总结 Agent。",
    "以下是角色「" + persona.name + "」最近参与的对话摘要：",
    conversationsWithThisPersona.join("\n\n"),
    "",
    "请基于以上对话，生成一段简洁的记忆总结（200字以内）。",
    "只写总结本身，不要加前缀。输出 Markdown 格式。",
  ].join("\n");

  try {
    const provider = getRuntimeProvider(persona.providerId) ?? getRuntimeProvider();
    if (!provider) return;
    const baseUrl = provider.baseUrl;
    const apiKey = provider.apiKey;
    const model = provider.model;

    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 400,
        temperature: 0.5,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) return;
    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    const summary = data.choices?.[0]?.message?.content?.trim();
    if (!summary) return;

    const today = new Date().toISOString().slice(0, 10);
    const entry = `\n\n### ${today}\n${summary}`;
    const newMemory = existingMemory ? existingMemory + entry : `# ${persona.name} 记忆\n${entry}`;
    updatePersonaMemory(personaId, newMemory);

    // Also write to soul.md
    try {
      const { writeFileSync, mkdirSync } = await import("node:fs");
      const { join } = await import("node:path");
      const dir = join(process.cwd(), "data", "souls");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${persona.id}.md`), newMemory, "utf-8");
    } catch { /* file write is best-effort */ }
  } catch {
    // silent — summary is non-critical
  }
}

export async function runAllPersonaSummaries(): Promise<void> {
  const personas = listAllPersonas().filter((p) => p.enabled);
  for (const persona of personas) {
    await summarizePersonaMemory(persona);
  }
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

function projectBelongsToEnterprise(projectId: string, enterpriseId: string): boolean {
  const project = db()
    .prepare("SELECT id FROM projects WHERE id = ? AND enterprise_id = ?")
    .get(projectId, enterpriseId);
  return Boolean(project);
}

export function createConversation(input: CreateConversationRequest): ConversationDetail | undefined {
  if (!projectBelongsToEnterprise(input.projectId, input.enterpriseId)) {
    return undefined;
  }

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
  if (input.projectId && !projectBelongsToEnterprise(input.projectId, current.enterpriseId)) {
    return undefined;
  }

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

export function buildProjectContext(enterpriseId: string, projectIds: string[]): string {
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
  const files = db()
    .prepare(`SELECT id, filename, mime_type, size, related_id, created_at FROM files WHERE related_type = 'project' AND related_id IN (${allowedPlaceholders}) ORDER BY created_at DESC LIMIT 20`)
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
  const fileLines = files.map((file) => {
    return `- ${file.filename} (${file.mime_type}, ${file.size} bytes, fileId: ${file.id}, projectId: ${file.related_id})`;
  });

  return [
    `Projects:\n${projectLines.join("\n") || "- 无"}`,
    `Library:\n${libraryLines.join("\n") || "- 无"}`,
    `Automations:\n${automationLines.join("\n") || "- 无"}`,
    `Files:\n${fileLines.join("\n") || "- 无"}`,
    `Recent conversations:\n${conversationLines.join("\n") || "- 无"}`,
  ].join("\n\n");
}

function buildAgentPlan(input: {
  contextLabel: string;
  projectCount: number;
  skillNames: string[];
  enabledToolCount: number;
}): AgentPlanStep[] {
  const skillDetail = input.skillNames.length ? input.skillNames.join("、") : "使用通用业务分析能力";
  return [
    {
      id: "scope",
      title: "确认任务范围",
      detail: input.contextLabel,
      status: "done",
    },
    {
      id: "context",
      title: "读取项目资料",
      detail: `汇总 ${input.projectCount} 个项目的资料、自动化和历史对话。`,
      status: "done",
    },
    {
      id: "skills",
      title: "匹配 Agent 技能",
      detail: skillDetail,
      status: "done",
    },
    {
      id: "tools",
      title: "执行工具或生成方案",
      detail: input.enabledToolCount > 0 ? `可调用 ${input.enabledToolCount} 个已启用工具。` : "没有启用工具，直接生成方案。",
      status: "done",
    },
    {
      id: "reply",
      title: "写入回复和执行记录",
      detail: "保存用户消息、AI 回复和工具执行结果。",
      status: "done",
    },
  ];
}

export async function addMessage(conversationId: string, input: AddMessageRequest, userId?: string): Promise<AddMessageResponse | undefined> {
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
  if (!provider) {
    throw new Error("NO_PROVIDER: 没有找到可用的 AI 模型账号，请在设置中添加并启用一个模型");
  }
  const thinkingProvider = persona?.thinkingProviderId
    ? getRuntimeProvider(persona.thinkingProviderId)
    : undefined;
  const contextLabel =
    input.contextScope === "selected_projects"
      ? `结合 ${input.contextProjectIds?.length ?? 0} 个指定项目资料`
      : "仅分析当前项目资料";
  const contextProjectIds =
    input.contextScope === "selected_projects" && input.contextProjectIds?.length
      ? input.contextProjectIds
      : [conversation.projectId];
  const projectContext = buildProjectContext(conversation.enterpriseId, contextProjectIds);
  const planSteps = buildAgentPlan({
    contextLabel,
    projectCount: contextProjectIds.length,
    skillNames: selectedSkills.map((skill) => skill.name),
    enabledToolCount: tools.filter((tool) => tool.status === "enabled").length,
  });

  try {
    const historyRows = db()
      .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC")
      .all(conversationId) as Record<string, unknown>[];
    let history = historyRows.map(rowToMessage);

    // Compress history when estimated tokens exceed 200K (≈400K chars for Chinese)
    const MAX_HISTORY_CHARS = 400_000;
    const KEEP_RECENT = 12;
    let historyNote = "";
    const totalChars = history.reduce((sum, m) => sum + m.content.length, 0);
    if (totalChars > MAX_HISTORY_CHARS && history.length > KEEP_RECENT) {
      const older = history.slice(0, -KEEP_RECENT);
      history = history.slice(-KEEP_RECENT);
      const olderChars = older.reduce((sum, m) => sum + m.content.length, 0);
      historyNote = [
        `[上下文已自动压缩：省略了 ${older.length} 条早期消息（约 ${Math.round(olderChars / 2000)}K token）。]`,
        `早期对话涉及：${older.slice(0, 3).map((m) => m.content.slice(0, 30)).join("；")}...`,
        `请基于最近 ${KEEP_RECENT} 条消息继续对话，必要时回顾早期上下文。`,
      ].join(" ");
    }

    const runtime = await getRuntime(userId);

    const result = await runtime.run({
      userContent: input.content,
      history,
      persona,
      skills: selectedSkills,
      tools,
      provider,
      thinkingProvider,
      context: {
        conversationTitle: conversation.title,
        contextLabel,
        projectContext,
        enterpriseId: conversation.enterpriseId,
        projectId: conversation.projectId,
        historyNote,
      },
      sessionId: conversationId,
    });

    const aiReply: Message = {
      id: `msg-${randomUUID()}`,
      role: "assistant",
      content: result.content,
      createdAt: new Date().toISOString(),
    };
    insertMsg.run(aiReply.id, conversationId, aiReply.role, aiReply.content, aiReply.createdAt);

    return {
      message: aiReply,
      planSteps: result.planSteps.length > 0 ? result.planSteps : planSteps,
      toolRuns: result.toolRuns,
    };
  } catch (e) {
    console.error("Agent kernel failed:", e);
    deleteMsg.run(userMsg.id);
    throw e;
  }
}

// ---- Workspace (aggregate query) ----

export function getWorkspace(enterpriseId?: string): Workspace {
  const d = db();

  const enterprises = ((enterpriseId
    ? d.prepare("SELECT * FROM enterprises WHERE id=? ORDER BY id").all(enterpriseId)
    : d.prepare("SELECT * FROM enterprises ORDER BY id").all()) as Record<string, unknown>[]).map(rowToEnterprise);
  const users = listUsers(enterpriseId);
  const projects = ((enterpriseId
    ? d.prepare("SELECT * FROM projects WHERE enterprise_id=? ORDER BY created_at ASC").all(enterpriseId)
    : d.prepare("SELECT * FROM projects ORDER BY created_at ASC").all()) as Record<string, unknown>[]).map(rowToProject);
  const conversations = ((enterpriseId
    ? d.prepare("SELECT * FROM conversations WHERE enterprise_id=? ORDER BY created_at ASC").all(enterpriseId)
    : d.prepare("SELECT * FROM conversations ORDER BY created_at ASC").all()) as Record<string, unknown>[]).map(rowToConversation);
  const libraryItems = ((enterpriseId
    ? d.prepare("SELECT * FROM library_items WHERE enterprise_id=? ORDER BY created_at ASC").all(enterpriseId)
    : d.prepare("SELECT * FROM library_items ORDER BY created_at ASC").all()) as Record<string, unknown>[]).map(rowToLibraryItem);
  const plugins = (d.prepare("SELECT * FROM plugins ORDER BY id").all() as Record<string, unknown>[]).map(rowToPlugin);
  const automations = ((enterpriseId
    ? d.prepare("SELECT a.* FROM automations a JOIN projects p ON p.id=a.project_id WHERE p.enterprise_id=? ORDER BY a.run_count DESC").all(enterpriseId)
    : d.prepare("SELECT * FROM automations ORDER BY run_count DESC").all()) as Record<string, unknown>[]).map(rowToAutomation);
  const automationIds = new Set(automations.map((automation) => automation.id));
  const recentAutomationRuns = listRecentAutomationRuns().filter((run) => automationIds.has(run.automationId));
  const tools = listTools();
  const recentToolRuns = listRecentToolRuns(12, enterpriseId);
  const skills = listSkills();
  const personas = listPersonas();
  const providers = listProviders();

  return { enterprises, users, projects, conversations, libraryItems, plugins, automations, recentAutomationRuns, tools, recentToolRuns, skills, personas, providers };
}
