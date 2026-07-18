import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { format } from "node:util";
import {
  defaultToolNames,
  LarkMcpTool,
  presetBaseRecordBatchToolNames,
  presetCalendarToolNames,
  presetTaskToolNames,
  TokenMode,
  type ToolName,
} from "@larksuiteoapi/lark-mcp/dist/mcp-tool/index.js";

// The MCP stdio transport reserves stdout for JSON-RPC frames. The official
// SDK emits startup diagnostics through console.*, so route those diagnostics
// to stderr before it is initialized; otherwise Claude Code rejects the MCP
// server as a malformed protocol stream.
for (const method of ["log", "info", "warn", "error"] as const) {
  console[method] = (...args: unknown[]) => process.stderr.write(`${format(...args)}\n`);
}

const appId = process.env.FEISHU_APP_ID?.trim();
const appSecret = process.env.FEISHU_APP_SECRET?.trim();

if (!appId || !appSecret) {
  throw new Error("飞书 MCP 缺少 FEISHU_APP_ID 或 FEISHU_APP_SECRET");
}

const userAccessToken = process.env.FEISHU_USER_ACCESS_TOKEN?.trim();
const tokenMode = userAccessToken ? TokenMode.USER_ACCESS_TOKEN : TokenMode.AUTO;
const requiredReadTools: ToolName[] = ["tenant.v2.tenant.query"];
// Keep the interactive MCP focused, but cover the normal read paths a business
// agent needs. The full official surface is intentionally not injected into
// every chat because its generated schemas are far too large for reliable use.
const collaborationReadTools: ToolName[] = [
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
const enabledTools = Array.from(new Set([
  ...defaultToolNames,
  ...presetBaseRecordBatchToolNames,
  ...presetTaskToolNames,
  ...presetCalendarToolNames,
  ...requiredReadTools,
  ...collaborationReadTools,
]));
const larkTool = new LarkMcpTool({
  appId,
  appSecret,
  domain: process.env.FEISHU_DOMAIN?.trim() || "https://open.feishu.cn",
  tokenMode,
  toolsOptions: {
    language: "zh",
    // Keep the app's granted scopes intact while avoiding 1,291 schemas in every chat context.
    allowTools: enabledTools as ToolName[],
  },
});

if (userAccessToken) larkTool.updateUserAccessToken(userAccessToken);

const server = new McpServer({
  name: "enterprise-flow-hub-feishu",
  version: "1.0.0",
});

// The official package currently exposes a CJS MCP SDK type while this app uses ESM.
// Both transport objects implement the same MCP server contract at runtime.
larkTool.registerMcpServer(server as never, { toolNameCase: "snake" });
await server.connect(new StdioServerTransport());
