import type { ToolName } from "@larksuiteoapi/lark-mcp/dist/mcp-tool/index.js";

/**
 * A deliberately curated full business surface for the official Feishu MCP.
 * Keeping this catalog explicit avoids injecting the package's entire generated
 * API (more than a thousand schemas), which makes tool selection unreliable.
 */
export const feishuReadTools: ToolName[] = [
  "tenant.v2.tenant.query",
  "im.v1.chat.get", "im.v1.chat.search", "im.v1.message.get", "im.v1.messageReaction.list",
  "drive.v1.file.list", "drive.v1.meta.batchQuery",
  "contact.v3.user.get", "contact.v3.user.list", "contact.v3.user.findByDepartment",
  "contact.v3.department.get", "contact.v3.department.list", "contact.v3.department.search",
  "task.v2.task.get", "task.v2.task.list", "task.v2.tasklist.get", "task.v2.tasklist.list",
  "task.v2.tasklist.tasks", "task.v2.comment.list",
  "calendar.v4.calendar.get", "calendar.v4.calendar.list", "calendar.v4.calendarEvent.list", "calendar.v4.calendarEvent.search",
  "approval.v4.instance.get", "approval.v4.instance.list", "approval.v4.instance.query",
  "approval.v4.task.query", "approval.v4.task.search",
];

export const feishuWriteTools: ToolName[] = [
  // Calendar: create calendars/events, invite attendees, meeting chats and minutes.
  "calendar.v4.calendar.create", "calendar.v4.calendar.patch", "calendar.v4.calendarEvent.create",
  "calendar.v4.calendarEvent.patch", "calendar.v4.calendarEventAttendee.create",
  "calendar.v4.calendarEventMeetingChat.create", "calendar.v4.calendarEventMeetingMinute.create",
  // Tasks: tasks, subtasks, comments, reminders, task lists and sections.
  "task.v2.task.create", "task.v2.task.patch", "task.v2.taskSubtask.create", "task.v2.tasklist.create",
  "task.v2.tasklist.patch", "task.v2.section.create", "task.v2.section.patch", "task.v2.comment.create",
  "task.v2.task.addMembers", "task.v2.task.addReminders",
  // Documents and Drive: create/edit documents, organize files and manage sharing.
  "docx.v1.document.create", "docx.v1.documentBlockChildren.create", "docx.v1.documentBlockDescendant.create",
  "docx.v1.documentBlock.batchUpdate", "docx.v1.documentBlock.patch", "drive.v1.file.copy", "drive.v1.file.move",
  "drive.v1.permissionMember.create", "drive.v1.permissionMember.batchCreate", "drive.v1.permissionMember.update",
  "drive.v1.permissionPublic.patch", "drive.v1.fileComment.create", "drive.v1.fileComment.patch",
  // Approvals: create definitions, submit instances and comment on an instance.
  "approval.v4.approval.create", "approval.v4.instance.create", "approval.v4.instanceComment.create",
  // IM: create/manage chats and send/update messages.
  "im.v1.chat.create", "im.v1.chat.update", "im.v1.chatMembers.create", "im.v1.message.create",
  "im.v1.message.patch", "im.v1.messageReaction.create", "im.v1.pin.create",
  // Bitable: create apps/tables/fields/views and write records in batches.
  "bitable.v1.app.create", "bitable.v1.app.copy", "bitable.v1.app.update", "bitable.v1.appTable.create",
  "bitable.v1.appTable.batchCreate", "bitable.v1.appTable.patch", "bitable.v1.appTableField.create",
  "bitable.v1.appTableField.update", "bitable.v1.appTableView.create", "bitable.v1.appTableView.patch",
  "bitable.v1.appTableRecord.create", "bitable.v1.appTableRecord.update", "bitable.v1.appTableRecord.batchCreate",
  "bitable.v1.appTableRecord.batchUpdate",
  // Organization changes are available, but still require an explicit confirmation in the agent prompt.
  "contact.v3.department.create", "contact.v3.department.patch", "contact.v3.group.create",
  "contact.v3.group.patch", "contact.v3.groupMember.add", "contact.v3.user.create", "contact.v3.user.patch",
];

export type FeishuMcpScope = "general" | "im" | "calendar" | "task" | "document" | "approval" | "bitable" | "contact";

const scopeTools: Record<FeishuMcpScope, ToolName[]> = {
  general: ["tenant.v2.tenant.query", "im.v1.chat.list", "im.v1.chat.search", "im.v1.message.list", "docx.builtin.search", "wiki.v1.node.search"],
  im: [
    "im.v1.chat.list", "im.v1.chat.get", "im.v1.chat.search", "im.v1.chat.create", "im.v1.chat.update",
    "im.v1.chatMembers.get", "im.v1.chatMembers.create", "im.v1.message.list", "im.v1.message.get",
    "im.v1.message.create", "im.v1.message.patch", "im.v1.messageReaction.create", "im.v1.pin.create",
  ],
  calendar: [
    "calendar.v4.calendar.primary", "calendar.v4.calendar.get", "calendar.v4.calendar.list", "calendar.v4.freebusy.list",
    "calendar.v4.calendar.create", "calendar.v4.calendar.patch", "calendar.v4.calendarEvent.get", "calendar.v4.calendarEvent.list",
    "calendar.v4.calendarEvent.search", "calendar.v4.calendarEvent.create", "calendar.v4.calendarEvent.patch",
    "calendar.v4.calendarEventAttendee.create", "calendar.v4.calendarEventMeetingChat.create", "calendar.v4.calendarEventMeetingMinute.create",
  ],
  task: [
    "task.v2.task.get", "task.v2.task.list", "task.v2.task.create", "task.v2.task.patch", "task.v2.taskSubtask.create",
    "task.v2.task.addMembers", "task.v2.task.addReminders", "task.v2.tasklist.get", "task.v2.tasklist.list",
    "task.v2.tasklist.create", "task.v2.tasklist.patch", "task.v2.tasklist.tasks", "task.v2.section.create",
    "task.v2.section.patch", "task.v2.comment.list", "task.v2.comment.create",
  ],
  document: [
    "docx.builtin.search", "docx.v1.document.rawContent", "docx.v1.document.create", "docx.v1.documentBlockChildren.create",
    "docx.v1.documentBlockDescendant.create", "docx.v1.documentBlock.batchUpdate", "docx.v1.documentBlock.patch",
    "wiki.v1.node.search", "wiki.v2.space.getNode", "drive.v1.file.list", "drive.v1.meta.batchQuery", "drive.v1.file.copy",
    "drive.v1.file.move", "drive.v1.permissionMember.create", "drive.v1.permissionMember.batchCreate", "drive.v1.permissionMember.update",
    "drive.v1.permissionPublic.patch", "drive.v1.fileComment.create", "drive.v1.fileComment.patch",
  ],
  approval: [
    "approval.v4.approval.create", "approval.v4.instance.create", "approval.v4.instance.get", "approval.v4.instance.list",
    "approval.v4.instance.query", "approval.v4.instanceComment.create", "approval.v4.task.query", "approval.v4.task.search",
  ],
  bitable: [
    "bitable.v1.app.create", "bitable.v1.app.copy", "bitable.v1.app.update", "bitable.v1.appTable.list", "bitable.v1.appTable.create",
    "bitable.v1.appTable.batchCreate", "bitable.v1.appTable.patch", "bitable.v1.appTableField.list", "bitable.v1.appTableField.create",
    "bitable.v1.appTableField.update", "bitable.v1.appTableView.create", "bitable.v1.appTableView.patch", "bitable.v1.appTableRecord.search",
    "bitable.v1.appTableRecord.create", "bitable.v1.appTableRecord.update", "bitable.v1.appTableRecord.batchCreate", "bitable.v1.appTableRecord.batchUpdate",
  ],
  contact: [
    "contact.v3.user.get", "contact.v3.user.list", "contact.v3.user.findByDepartment", "contact.v3.user.create", "contact.v3.user.patch",
    "contact.v3.department.get", "contact.v3.department.list", "contact.v3.department.search", "contact.v3.department.create", "contact.v3.department.patch",
    "contact.v3.group.create", "contact.v3.group.patch", "contact.v3.groupMember.add",
  ],
};

export function toolsForFeishuScope(scope: string | undefined): ToolName[] {
  return scopeTools[scope as FeishuMcpScope] ?? scopeTools.general;
}
