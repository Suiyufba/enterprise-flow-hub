import { z } from "zod";

export const EnterpriseSchema = z.object({
  id: z.string(),
  name: z.string(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20),
});

export const UpdateEnterpriseRequestSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
});

export const UserSchema = z.object({
  id: z.string(),
  enterpriseId: z.string(),
  username: z.string(),
  displayName: z.string(),
  role: z.enum(["admin", "member"]),
  departmentId: z.string().optional(),
  position: z.string().optional(),
  createdAt: z.string(),
});

export const RegisterUserRequestSchema = z.object({
  enterpriseId: z.string(),
  username: z.string().min(2).max(40),
  password: z.string().min(4).max(100),
  displayName: z.string().min(1).max(60),
});

export const LoginRequestSchema = z.object({
  username: z.string(),
  password: z.string(),
});

export const DepartmentSchema = z.object({
  id: z.string(),
  enterpriseId: z.string(),
  parentId: z.string().optional(),
  name: z.string(),
  createdAt: z.string(),
});

export const CreateDepartmentRequestSchema = z.object({
  enterpriseId: z.string(),
  parentId: z.string().optional(),
  name: z.string().min(1).max(80),
});

export const UpdateDepartmentRequestSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  parentId: z.string().optional().nullable(),
});

export const CreateUserRequestSchema = z.object({
  enterpriseId: z.string(),
  username: z.string().min(2).max(40),
  password: z.string().min(4).max(100),
  displayName: z.string().min(1).max(60),
  role: z.enum(["admin", "member"]).optional(),
  departmentId: z.string().optional(),
  position: z.string().max(80).optional(),
});

export const UpdateUserRequestSchema = z.object({
  displayName: z.string().min(1).max(60).optional(),
  role: z.enum(["admin", "member"]).optional(),
  departmentId: z.string().optional().nullable(),
  position: z.string().max(80).optional().nullable(),
});

export const ProjectSchema = z.object({
  id: z.string(),
  enterpriseId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  createdAt: z.string(),
});

export const ConversationSchema = z.object({
  id: z.string(),
  enterpriseId: z.string(),
  projectId: z.string(),
  title: z.string(),
  tags: z.array(z.string()),
  createdAt: z.string(),
});

export const MessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: z.string(),
});

export const ConversationDetailSchema = ConversationSchema.extend({
  messages: z.array(MessageSchema),
});

export const LibraryItemSchema = z.object({
  id: z.string(),
  enterpriseId: z.string(),
  projectId: z.string(),
  name: z.string(),
  type: z.enum(["screenshot", "spreadsheet", "document", "note"]),
  summary: z.string(),
  visibility: z.enum(["public", "private"]),
  createdAt: z.string(),
});

export const PluginSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  configRequired: z.boolean(),
  configured: z.boolean(),
  configSummary: z.string().optional(),
});

export const WorkflowNodeTypeSchema = z.enum(["trigger", "agent", "condition", "action", "loop"]);

export const WorkflowGraphNodeSchema = z.object({
  id: z.string().min(1).max(100),
  nodeType: WorkflowNodeTypeSchema,
  position: z.object({
    x: z.number().finite().min(-100_000).max(100_000),
    y: z.number().finite().min(-100_000).max(100_000),
  }),
  config: z.record(z.string().max(80), z.string().max(5_000)).default({}),
});

export const WorkflowGraphEdgeSchema = z.object({
  id: z.string().min(1).max(100),
  source: z.string().min(1).max(100),
  target: z.string().min(1).max(100),
  label: z.string().max(200).optional(),
});

export const WorkflowGraphSchema = z.object({
  version: z.literal(1),
  nodes: z.array(WorkflowGraphNodeSchema).max(100),
  edges: z.array(WorkflowGraphEdgeSchema).max(200),
}).superRefine((graph, ctx) => {
  const nodeIds = new Set<string>();
  for (const [index, node] of graph.nodes.entries()) {
    if (nodeIds.has(node.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "工作流节点 ID 不能重复", path: ["nodes", index, "id"] });
    }
    nodeIds.add(node.id);
  }

  const edgeIds = new Set<string>();
  for (const [index, edge] of graph.edges.entries()) {
    if (edgeIds.has(edge.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "工作流连线 ID 不能重复", path: ["edges", index, "id"] });
    }
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "工作流连线必须指向已存在的节点", path: ["edges", index] });
    }
  }
});

export const AutomationSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  trigger: z.string(),
  triggerType: z.enum(["schedule", "message", "webhook", "email", "file", "manual"]),
  action: z.string(),
  actionType: z.enum(["send_email", "call_ai", "shell", "api_call", "notify", "browser", "tool_call"]),
  agentModel: z.string().optional(),
  actionPluginId: z.string().optional(),
  actionToolId: z.string().optional(),
  actionInput: z.record(z.string(), z.unknown()).default({}),
  workflowGraph: WorkflowGraphSchema.optional(),
  systemPrompt: z.string().optional(),
  webhookSecret: z.string().optional(),
  enabled: z.boolean(),
  runCount: z.number(),
  lastRun: z.string().optional(),
  lastStatus: z.enum(["success", "error"]).optional(),
  lastOutput: z.string().optional(),
  lastError: z.string().optional(),
  lastDurationMs: z.number().optional(),
});

export const AutomationRunSchema = z.object({
  id: z.string(),
  automationId: z.string(),
  status: z.enum(["success", "error"]),
  triggerEvent: z.record(z.string(), z.unknown()),
  output: z.string(),
  errorMessage: z.string(),
  durationMs: z.number(),
  createdAt: z.string(),
});

export const TaskSchema = z.object({
  id: z.string(),
  enterpriseId: z.string(),
  projectId: z.string(),
  assigneeId: z.string().nullable(),
  title: z.string(),
  description: z.string(),
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  dueDate: z.string().nullable(),
  sourceType: z.string().nullable(),
  sourceId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateTaskRequestSchema = z.object({
  enterpriseId: z.string(),
  projectId: z.string().optional(),
  title: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  dueDate: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
});

export const UpdateTaskRequestSchema = z.object({
  projectId: z.string().optional(),
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).optional(),
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

export const ToolDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  kind: z.enum(["mcp", "cli", "http", "browser"]),
  status: z.enum(["enabled", "needs_config", "disabled"]),
  risk: z.enum(["read_only", "write", "admin"]),
  inputSchema: z.string(),
  examplePrompt: z.string(),
  createdAt: z.string(),
});

export const ToolRunSchema = z.object({
  id: z.string(),
  toolId: z.string(),
  status: z.enum(["success", "error"]),
  input: z.record(z.unknown()),
  output: z.string(),
  createdAt: z.string(),
});

export const AgentPlanStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  detail: z.string(),
  status: z.enum(["pending", "running", "done", "skipped"]),
});

export const AddMessageResponseSchema = z.object({
  message: MessageSchema,
  planSteps: z.array(AgentPlanStepSchema),
  toolRuns: z.array(ToolRunSchema),
});

export const AgentSkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  toolIds: z.array(z.string()),
  prompt: z.string(),
  enabled: z.boolean(),
  createdAt: z.string(),
});

export const AgentPersonaSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  description: z.string(),
  systemPrompt: z.string(),
  defaultSkillIds: z.array(z.string()),
  providerId: z.string(),
  thinkingProviderId: z.string().optional(),
  enabled: z.boolean(),
  memory: z.string().optional(),
});

export const ModelProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  baseUrl: z.string(),
  model: z.string(),
  configured: z.boolean(),
  enabled: z.boolean(),
});

export const UpdateProviderRequestSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  baseUrl: z.string().min(1).max(200).optional(),
  model: z.string().min(1).max(60).optional(),
  apiKey: z.string().min(1).max(200).optional(),
  enabled: z.boolean().optional(),
});

export const WorkspaceSchema = z.object({
  enterprises: z.array(EnterpriseSchema),
  users: z.array(UserSchema),
  projects: z.array(ProjectSchema),
  conversations: z.array(ConversationSchema),
  libraryItems: z.array(LibraryItemSchema),
  plugins: z.array(PluginSchema),
  automations: z.array(AutomationSchema),
  recentAutomationRuns: z.array(AutomationRunSchema),
  tools: z.array(ToolDefinitionSchema),
  recentToolRuns: z.array(ToolRunSchema),
  skills: z.array(AgentSkillSchema),
  personas: z.array(AgentPersonaSchema),
  providers: z.array(ModelProviderSchema),
});

export const CreateProjectRequestSchema = z.object({
  enterpriseId: z.string().optional(),
  enterpriseName: z.string().min(1).max(80).optional(),
  name: z.string().min(1).max(80),
  description: z.string().max(300).optional(),
});

export const CreateLibraryItemRequestSchema = z.object({
  enterpriseId: z.string(),
  projectId: z.string(),
  name: z.string().min(1).max(120),
  type: z.enum(["screenshot", "spreadsheet", "document", "note"]),
  summary: z.string().min(1).max(500),
  visibility: z.enum(["public", "private"]),
});

export const CreateAutomationRequestSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1).max(120),
  trigger: z.string().min(1).max(200),
  triggerType: z.enum(["schedule", "message", "webhook", "email", "file", "manual"]),
  action: z.string().min(1).max(200),
  actionType: z.enum(["send_email", "call_ai", "shell", "api_call", "notify", "browser", "tool_call"]),
  agentModel: z.string().optional(),
  actionPluginId: z.string().optional(),
  actionToolId: z.string().optional(),
  actionInput: z.record(z.string(), z.unknown()).optional(),
  workflowGraph: WorkflowGraphSchema.optional(),
  systemPrompt: z.string().max(500).optional(),
});

export const PluginConfigRequestSchema = z.object({
  fields: z.record(z.string().max(500)).default({}),
});

export const PluginConfigResponseSchema = z.object({
  pluginId: z.string(),
  fields: z.record(z.string()),
  requiredFields: z.array(z.string()),
  configured: z.boolean(),
  hint: z.string(),
});

export const CreateConversationRequestSchema = z.object({
  enterpriseId: z.string(),
  projectId: z.string(),
  title: z.string().min(1).max(120),
});

export const UpdateConversationRequestSchema = z.object({
  projectId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  title: z.string().min(1).max(120).optional(),
});

export const AddMessageRequestSchema = z.object({
  content: z.string().max(2000).default(""),
  fileIds: z.array(z.string()).max(6).optional(),
  personaId: z.string().optional(),
  skillIds: z.array(z.string()).optional(),
  contextScope: z.enum(["current_project", "selected_projects"]).optional(),
  contextProjectIds: z.array(z.string()).optional(),
}).refine((value) => value.content.trim().length > 0 || Boolean(value.fileIds?.length), {
  message: "消息内容和附件不能同时为空",
});

export const UpdateProjectRequestSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(300).optional(),
});

export const UpdateLibraryItemRequestSchema = z.object({
  enterpriseId: z.string().optional(),
  projectId: z.string().optional(),
  name: z.string().min(1).max(120).optional(),
  type: z.enum(["screenshot", "spreadsheet", "document", "note"]).optional(),
  summary: z.string().min(1).max(500).optional(),
  visibility: z.enum(["public", "private"]).optional(),
});

export const RunToolRequestSchema = z.object({
  input: z.record(z.unknown()).default({}),
  dryRun: z.boolean().optional(),
});

export const CreateSkillRequestSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(300),
  toolIds: z.array(z.string()).default([]),
  prompt: z.string().min(1).max(800),
});

export const UpdateSkillRequestSchema = z.object({
  enabled: z.boolean().optional(),
  name: z.string().min(1).max(80).optional(),
  description: z.string().min(1).max(300).optional(),
  toolIds: z.array(z.string()).optional(),
  prompt: z.string().min(1).max(800).optional(),
});

export type Department = z.infer<typeof DepartmentSchema>;
export type CreateDepartmentRequest = z.infer<typeof CreateDepartmentRequestSchema>;
export type UpdateDepartmentRequest = z.infer<typeof UpdateDepartmentRequestSchema>;
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;
export type Enterprise = z.infer<typeof EnterpriseSchema>;
export type UpdateEnterpriseRequest = z.infer<typeof UpdateEnterpriseRequestSchema>;
export type User = z.infer<typeof UserSchema>;
export type RegisterUserRequest = z.infer<typeof RegisterUserRequestSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type ConversationDetail = z.infer<typeof ConversationDetailSchema>;
export type CreateConversationRequest = z.infer<typeof CreateConversationRequestSchema>;
export type UpdateConversationRequest = z.infer<typeof UpdateConversationRequestSchema>;
export type LibraryItem = z.infer<typeof LibraryItemSchema>;
export type Plugin = z.infer<typeof PluginSchema>;
export type PluginConfigRequest = z.infer<typeof PluginConfigRequestSchema>;
export type PluginConfigResponse = z.infer<typeof PluginConfigResponseSchema>;
export type Automation = z.infer<typeof AutomationSchema>;
export type WorkflowGraph = z.infer<typeof WorkflowGraphSchema>;
export type WorkflowGraphNode = z.infer<typeof WorkflowGraphNodeSchema>;
export type WorkflowGraphEdge = z.infer<typeof WorkflowGraphEdgeSchema>;
export type AutomationRun = z.infer<typeof AutomationRunSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;
export type UpdateTaskRequest = z.infer<typeof UpdateTaskRequestSchema>;
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;
export type ToolRun = z.infer<typeof ToolRunSchema>;
export type AgentPlanStep = z.infer<typeof AgentPlanStepSchema>;
export type AddMessageResponse = z.infer<typeof AddMessageResponseSchema>;
export type AgentSkill = z.infer<typeof AgentSkillSchema>;
export type AgentPersona = z.infer<typeof AgentPersonaSchema>;
export type ModelProvider = z.infer<typeof ModelProviderSchema>;
export type Workspace = z.infer<typeof WorkspaceSchema>;
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;
export type CreateLibraryItemRequest = z.infer<typeof CreateLibraryItemRequestSchema>;
export type CreateAutomationRequest = z.infer<typeof CreateAutomationRequestSchema>;
export type AddMessageRequest = z.infer<typeof AddMessageRequestSchema>;
export type UpdateProjectRequest = z.infer<typeof UpdateProjectRequestSchema>;
export type UpdateLibraryItemRequest = z.infer<typeof UpdateLibraryItemRequestSchema>;
export type RunToolRequest = z.infer<typeof RunToolRequestSchema>;
export type CreateSkillRequest = z.infer<typeof CreateSkillRequestSchema>;
export type UpdateSkillRequest = z.infer<typeof UpdateSkillRequestSchema>;
export type UpdateProviderRequest = z.infer<typeof UpdateProviderRequestSchema>;
