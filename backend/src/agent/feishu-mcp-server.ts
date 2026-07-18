import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  defaultToolNames,
  LarkMcpTool,
  presetBaseRecordBatchToolNames,
  presetCalendarToolNames,
  presetTaskToolNames,
  TokenMode,
  type ToolName,
} from "@larksuiteoapi/lark-mcp/dist/mcp-tool/index.js";

const appId = process.env.FEISHU_APP_ID?.trim();
const appSecret = process.env.FEISHU_APP_SECRET?.trim();

if (!appId || !appSecret) {
  throw new Error("飞书 MCP 缺少 FEISHU_APP_ID 或 FEISHU_APP_SECRET");
}

const userAccessToken = process.env.FEISHU_USER_ACCESS_TOKEN?.trim();
const tokenMode = userAccessToken ? TokenMode.USER_ACCESS_TOKEN : TokenMode.AUTO;
const requiredReadTools: ToolName[] = ["tenant.v2.tenant.query"];
const enabledTools = Array.from(new Set([
  ...defaultToolNames,
  ...presetBaseRecordBatchToolNames,
  ...presetTaskToolNames,
  ...presetCalendarToolNames,
  ...requiredReadTools,
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
