import type {
  AgentPersona,
  AgentSkill,
  Message,
  ModelProvider,
  ToolDefinition,
  ToolRun,
} from "shared";
import { aiChatMessages, type AiProviderOptions, type FunctionDef, type ToolCall } from "../ai/client.js";

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  reasoning_content?: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

export type AgentRuntimeProvider = ModelProvider & {
  apiKey?: string;
};

export type AgentKernelContext = {
  conversationTitle: string;
  contextLabel: string;
  projectContext: string;
  enterpriseId: string;
  projectId: string;
  historyNote?: string;
};

export type AgentKernelInput = {
  userContent: string;
  history: Message[];
  persona?: AgentPersona;
  skills: AgentSkill[];
  tools: ToolDefinition[];
  provider?: AgentRuntimeProvider;
  thinkingProvider?: AgentRuntimeProvider;
  context: AgentKernelContext;
  runTool: (
    toolId: string,
    input: Record<string, unknown>,
    options: { dryRun: boolean; reason: string },
  ) => Promise<ToolRun | undefined>;
  maxTurns?: number;
};

export type AgentKernelResult = {
  content: string;
  toolRuns: ToolRun[];
};

function buildFunctionDefs(tools: ToolDefinition[]): FunctionDef[] {
  return tools
    .filter((t) => t.status === "enabled")
    .map((t) => {
      let properties: Record<string, unknown> = {};
      let required: string[] = [];
      try {
        // inputSchema is a JSON string of example input like {"command":"ls","cwd":"/app"}
        // Infer types from example values to build a JSON Schema
        const example = typeof t.inputSchema === "string"
          ? JSON.parse(t.inputSchema)
          : (t.inputSchema || {});
        if (example && typeof example === "object" && !Array.isArray(example)) {
          for (const [key, value] of Object.entries(example as Record<string, unknown>)) {
            const typ = typeof value;
            properties[key] = {
              type: typ === "number" ? "number" : typ === "boolean" ? "boolean" : "string",
              description: key,
            };
          }
          required = Object.keys(properties);
        }
      } catch {
        properties = {};
      }
      return {
        name: t.id,
        description: t.description,
        parameters: {
          type: "object",
          properties,
          required,
        },
      };
    });
}

export function buildSystemPrompt(input: AgentKernelInput): string {
  const skillPrompt = input.skills
    .filter((s) => s.enabled)
    .map((s) => `## Skill: ${s.name}\n${s.prompt}`)
    .join("\n\n");

  return [
    "你是 Enterprise Flow Hub 的内核 Agent，运行在中小企业轻量自动化平台中。你可以读取项目资料、分析表格和截图、创建业务记录、执行脚本、巡检网页、推送通知。",
    "",

    // ── Core Rules ──
    "## 核心行为准则",
    "1. **行动优先** — 用户说「帮我看」「帮我做」「查一下」时，必须先调用工具去执行，而不是只给文字建议。",
    "2. **先做再说** — 工具执行完成后，根据结果告诉用户发生了什么，不要预测结果。",
    "3. **持久化业务数据** — 用户提到的客户、订单、供应商、合同等业务对象，必须用 tool-create-library-item 存入项目资料库。",
    "4. **告诉用户去哪看** — 创建了自动化规则后提醒用户去「自动化」页面查看，创建了资料后提醒去「业务资料」页面查看。各页面路径：",
    "   - 项目管理：左侧边栏项目列表，可切换项目",
    "   - 业务资料：点击项目卡片进入，或左侧「资料库」",
    "   - 自动化规则：左侧「自动化」页面",
    "   - 设置（模型/角色）：左下角齿轮图标",
    "5. **不要反问 EFH 基础设施** — EFH 后端、SQLite 数据库和插件配置由当前系统托管；涉及发票、订单、资料库、自动化、通知插件状态时，优先通过工具/API 查询或操作，不要向用户索要 SSH、数据库文件路径或 EFH API 地址。",
    "",
    "## EFH 业务数据与通知规则",
    "- 当前企业和项目必须使用下方「当前工作上下文」里的 enterpriseId、projectId，不要编造 ID。启航留学线上企业 ID 是 ent-qihang；云杉贸易线上企业 ID 是 ent-yunshan。",
    "- 发票数据存放在 EFH 后端 SQLite 的 invoices 表；线上容器内路径是 /data/efh.db。常规业务查询应走站内 API 或工具，不要让用户手动提供数据库。",
    "- 发票查询 API：GET /api/invoices?enterpriseId=<enterpriseId>&status=<status>&limit=<limit>；代码内对应 listInvoices()。",
    "- 飞书通知依赖 plugin-feishu 的 webhookUrl；企业微信依赖 plugin-wecom 的 botId/secret。未配置时告诉用户去「插件」页绑定，不要强行发送。",
    "",

    // ── Tool Guide ──
    "## 可用工具及使用场景",
    "",
    "### tool-create-library-item（创建业务资料）⭐ 高频",
    "- 用途：在项目下持久化保存业务对象。",
    "- 何时用：用户说「添加客户」「新增订单」「记录供应商」「保存这条信息」「把这个存下来」等。",
    `- 必传参数：enterpriseId="${input.context.enterpriseId}"、projectId="${input.context.projectId}"（直接用当前上下文的值，不要编造）、name（业务对象名称）、summary（关键信息摘要）。`,
    "- 可选参数：type（screenshot/spreadsheet/document/note，默认 note）、visibility（public/private，默认 public）。",
    "- 示例：用户说「添加客户王芳电话138xxxx」，→ 调用此工具，name=王芳，summary=电话138xxxx，type=note。",
    "",
    "### tool-csv-profile（表格结构分析）",
    "- 用途：读取 CSV/Excel 文件的表头、样例行，输出数据画像。",
    "- 何时用：用户上传了表格文件，或说「分析这个表格」「看看这个 Excel」。",
    "",
    "### tool-mcp-company-context（企业资料查询）",
    "- 用途：读取项目资料库、自动化规则和历史对话的上下文。",
    "- 何时用：需要了解已有的项目资料、自动化配置或对话历史时。",
    "- 参数：projectId（项目ID）、query（查询关键词）。",
    "",
    "### tool-bash（命令执行）",
    "- 用途：执行服务器上的 bash 命令。",
    "- 何时用：用户说「部署」「安装依赖」「重启服务」「git」「npm」「构建」等。",
    "",
    "### tool-browser-check（网页巡检）",
    "- 用途：打开指定网页检查关键状态。",
    "- 何时用：用户说「检查一下 CRM 后台」「看看那个页面」。",
    "",
    "### tool-create-automation（创建自动化规则）⭐ 高频",
    "- 用途：在项目下创建定时任务、消息触发等自动化规则。",
    "- 何时用：用户说「每天早上帮我...」「设置定时任务」「自动清理」「自动通知」等。",
    `- 必传参数：projectId="${input.context.projectId}"（直接用当前上下文）、name（规则名称）、trigger（触发条件描述，如「每天早上9:00」）、action（执行动作描述）、triggerType（触发类型：schedule/message/webhook/email/file/manual，默认 schedule）、actionType（动作类型：call_ai/send_email/shell/api_call/notify/browser，默认 call_ai）。`,
    "- 示例：用户说「帮我设置每天早上9点自动清理重复的电话号码」，→ 调用此工具，name=每日清理重复电话，trigger=每天早上9:00，triggerType=schedule，action=删除重复的电话号码，actionType=call_ai。",
    "",
    "### tool-feishu-notify（消息推送）⭐ 需配置",
    "- 用途：推送消息到飞书/企业微信群。",
    "- 限制：需要先在「插件」页面配置 Webhook 才能使用。如果未配置，告诉用户去设置。",
    "",
    // ── Persona ──
    input.persona?.systemPrompt
      ? `## 当前角色\n${input.persona.systemPrompt}`
      : "",
    "",

    // ── Skills ──
    skillPrompt ? `## 已激活技能\n${skillPrompt}` : "",
    "",

    // ── Project Context ──
    `## 当前工作上下文`,
    `- 项目：${input.context.conversationTitle}`,
    `- 企业ID：${input.context.enterpriseId}`,
    `- 项目ID：${input.context.projectId}`,
    `- 资料范围：${input.context.contextLabel}`,
    "",
    `### 项目已有资料`,
    input.context.projectContext || "暂无项目资料。",
    "",

    // ── History note (compression) ──
    input.context.historyNote
      ? `${input.context.historyNote}\n`
      : "",

    // ── Output Style ──
    "## 回答风格",
    "- 使用中文，先给结论再展开细节。",
    "- 结构化输出优先：使用标题、列表、表格、代码块。",
    "- 工具执行结果要引用关键数据，不要笼统概括。",
    "- 如果用户需求不明确，问 1 个关键问题澄清，不要假设。",
    "- 创建了东西要主动告诉用户去哪里查看。",
    "",

    // ── Constraints ──
    "## 限制",
    "- 不要编造数据。一切以工具返回结果为准。",
    "- 不要操作 settings、login、auth 相关路径。",
    "- 飞书通知工具未配置时不要强行使用，告诉用户去插件页配置。",
    "- 单次对话最多 10 轮工具调用，若未完成则总结进度并建议缩小范围。",
  ].filter(Boolean).join("\n");
}

function toProviderOptions(p?: AgentRuntimeProvider): AiProviderOptions | undefined {
  if (!p?.enabled) return undefined;
  return {
    baseUrl: p.baseUrl,
    model: p.model,
    apiKey: p.apiKey,
  };
}

function historyToMessages(history: Message[]): ChatMessage[] {
  return history.slice(-24).map((m) => ({
    role: m.role as ChatMessage["role"],
    content: m.content,
  }));
}

export async function runAgentKernel(input: AgentKernelInput): Promise<AgentKernelResult> {
  const toolsById = new Map(input.tools.map((t) => [t.id, t]));
  const functionDefs = buildFunctionDefs(input.tools);
  const toolRuns: ToolRun[] = [];
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(input) },
    ...historyToMessages(input.history),
    { role: "user", content: input.userContent },
  ];
  const defaultProvider = toProviderOptions(input.provider);
  const thinkProvider = input.thinkingProvider
    ? toProviderOptions(input.thinkingProvider)
    : undefined;
  const maxTurns = input.maxTurns ?? 10;

  for (let turn = 0; turn < maxTurns; turn += 1) {
    // Use thinking provider for the first turn (planning/reasoning), then switch to default
    const activeProvider = turn === 0 && thinkProvider ? thinkProvider : defaultProvider;
    const resp = await aiChatMessages(messages, {
      temperature: 0.7,
      maxTokens: 3072,
      provider: activeProvider,
      tools: functionDefs,
    });

    // No tool calls — agent is done
    if (resp.toolCalls.length === 0) {
      const finalContent = resp.content || "任务已完成。";
      return { content: finalContent, toolRuns };
    }

    // Execute tool calls
    const results: Array<{ toolId: string; output: string }> = [];

    // Add assistant response with tool_calls so API can correlate results
    messages.push({
      role: "assistant",
      content: resp.content || "",
      ...(resp.reasoningContent ? { reasoning_content: resp.reasoningContent } : {}),
      tool_calls: resp.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    });

    for (const tc of resp.toolCalls) {
      const tool = toolsById.get(tc.name);
      if (!tool || tool.status !== "enabled") {
        results.push({ toolId: tc.name, output: `工具 ${tc.name} 不存在或未启用。` });
        continue;
      }

      // Always run live — executors handle their own safety
      const run = await input.runTool(tool.id, tc.arguments, {
        dryRun: false,
        reason: "agent triggered via function calling",
      });

      if (run) {
        toolRuns.push(run);
        results.push({
          toolId: tc.name,
          output: [
            `工具：${tool.name}`,
            `状态：${run.status}`,
            `输入：${JSON.stringify(run.input)}`,
            `输出：${run.output}`,
          ].join("\n"),
        });
      } else {
        results.push({ toolId: tc.name, output: `工具执行失败。` });
      }
    }

    // Send tool results back
    for (let i = 0; i < resp.toolCalls.length; i++) {
      const tc = resp.toolCalls[i];
      const result = results[i];
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: result?.output ?? "无输出",
      });
    }
  }

  return {
    content: "已执行多轮工具调用，任务可能未完全完成。请缩小范围后重试。",
    toolRuns,
  };
}
