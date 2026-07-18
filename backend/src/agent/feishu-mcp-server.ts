import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AllToolsZh, LarkMcpTool, type ToolName, TokenMode } from "@larksuiteoapi/lark-mcp/dist/mcp-tool/index.js";

const appId = process.env.FEISHU_APP_ID?.trim();
const appSecret = process.env.FEISHU_APP_SECRET?.trim();

if (!appId || !appSecret) {
  throw new Error("飞书 MCP 缺少 FEISHU_APP_ID 或 FEISHU_APP_SECRET");
}

const userAccessToken = process.env.FEISHU_USER_ACCESS_TOKEN?.trim();
const tokenMode = userAccessToken ? TokenMode.USER_ACCESS_TOKEN : TokenMode.AUTO;
const larkTool = new LarkMcpTool({
  appId,
  appSecret,
  domain: process.env.FEISHU_DOMAIN?.trim() || "https://open.feishu.cn",
  tokenMode,
  toolsOptions: {
    language: "zh",
    // The official MCP has no preset.all; expose its complete generated tool list.
    allowTools: AllToolsZh.map((tool) => tool.name as ToolName),
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
