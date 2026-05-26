import { z } from "zod";

export const EnterpriseSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const UserSchema = z.object({
  id: z.string(),
  enterpriseId: z.string(),
  username: z.string(),
  displayName: z.string(),
  role: z.enum(["admin", "member"]),
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

export const AutomationSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  trigger: z.string(),
  triggerType: z.enum(["schedule", "message", "webhook", "email", "file", "manual"]),
  action: z.string(),
  actionType: z.enum(["send_email", "call_ai", "shell", "api_call", "notify", "browser"]),
  agentModel: z.string().optional(),
  actionPluginId: z.string().optional(),
  systemPrompt: z.string().optional(),
  enabled: z.boolean(),
  runCount: z.number(),
  lastRun: z.string().optional(),
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
  actionType: z.enum(["send_email", "call_ai", "shell", "api_call", "notify", "browser"]),
  agentModel: z.string().optional(),
  actionPluginId: z.string().optional(),
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
  content: z.string().min(1).max(2000),
  personaId: z.string().optional(),
  skillIds: z.array(z.string()).optional(),
  contextScope: z.enum(["current_project", "selected_projects"]).optional(),
  contextProjectIds: z.array(z.string()).optional(),
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

export type Enterprise = z.infer<typeof EnterpriseSchema>;
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
