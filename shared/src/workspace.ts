import { z } from "zod";

export const EnterpriseSchema = z.object({
  id: z.string(),
  name: z.string(),
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
  createdAt: z.string(),
});

export const LibraryItemSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  type: z.enum(["screenshot", "spreadsheet", "document", "note"]),
  summary: z.string(),
  createdAt: z.string(),
});

export const PluginSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  enabled: z.boolean(),
});

export const AutomationSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  trigger: z.string(),
  action: z.string(),
  enabled: z.boolean(),
});

export const WorkspaceSchema = z.object({
  enterprises: z.array(EnterpriseSchema),
  projects: z.array(ProjectSchema),
  conversations: z.array(ConversationSchema),
  libraryItems: z.array(LibraryItemSchema),
  plugins: z.array(PluginSchema),
  automations: z.array(AutomationSchema),
});

export const CreateProjectRequestSchema = z.object({
  enterpriseId: z.string().optional(),
  enterpriseName: z.string().min(1).max(80).optional(),
  name: z.string().min(1).max(80),
  description: z.string().max(300).optional(),
});

export const CreateLibraryItemRequestSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1).max(120),
  type: z.enum(["screenshot", "spreadsheet", "document", "note"]),
  summary: z.string().min(1).max(500),
});

export const CreateAutomationRequestSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1).max(120),
  trigger: z.string().min(1).max(200),
  action: z.string().min(1).max(200),
});

export type Enterprise = z.infer<typeof EnterpriseSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;
export type LibraryItem = z.infer<typeof LibraryItemSchema>;
export type Plugin = z.infer<typeof PluginSchema>;
export type Automation = z.infer<typeof AutomationSchema>;
export type Workspace = z.infer<typeof WorkspaceSchema>;
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;
export type CreateLibraryItemRequest = z.infer<typeof CreateLibraryItemRequestSchema>;
export type CreateAutomationRequest = z.infer<typeof CreateAutomationRequestSchema>;
