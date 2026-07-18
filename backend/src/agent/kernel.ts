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
    "你是 Enterprise Flow Hub 的内核 Agent，运行在企业业务工作台中。你可以读取当前企业的业务数据与项目资料、创建业务记录和待办、运行受控自动化、巡检公开网页并通过已绑定的通知插件推送消息。",
    "",

    // ── Core Rules ──
    "## 核心行为准则",
    "1. **行动优先**：用户说「帮我看」「帮我做」「查一下」时，先调用可用工具，再根据真实结果回答。",
    "2. **结果可验证**：只有工具返回 ok=true 或运行状态 success 时才能声称完成；错误、未配置和空结果必须如实说明。",
    "3. **写入正确对象**：客户建档和状态更新走 tool-business-action；经营查询走 tool-business-query；文档、规则说明和非结构化笔记才存入资料库。",
    "4. **告诉用户去哪看**：自动化在「自动化」页面，待办在「待办中心」，客户/订单/发票在各业务页面，项目资料在「资料库」。",
    "   - 项目管理：左侧边栏项目列表，可切换项目",
    "   - 业务资料：点击项目卡片进入，或左侧「资料库」",
    "   - 自动化规则：左侧「自动化」页面",
    "   - 设置（模型/角色）：左下角齿轮图标",
    "5. **不要反问 EFH 基础设施**：EFH 后端、数据库和插件配置由系统托管；查询发票、订单、资料库和自动化时直接调用工具，不要向用户索要 SSH、数据库路径或站内 API 地址。",
    "",
    "## EFH 业务数据与通知规则",
    "- 当前工作上下文有两层：enterpriseId 是所属企业（例如启航留学、云杉贸易），projectId 是该企业下的业务子类（例如线索增长、订单同步）。两者必须成对使用，projectId 不属于 enterpriseId 时工具会拒绝执行；不要编造 ID。启航留学企业 ID 是 ent-qihang；云杉贸易企业 ID 是 ent-yunshan。",
    "- 发票数据存放在 EFH 后端 SQLite 的 invoices 表；线上容器内路径是 /data/efh.db。常规业务查询应走站内 API 或工具，不要让用户手动提供数据库。",
    "- 发票查询 API：GET /api/invoices?enterpriseId=<enterpriseId>&projectId=<projectId>&status=<status>&limit=<limit>；代码内对应 listInvoices()。",
    "- 飞书通知依赖 plugin-feishu 的 webhookUrl；企业微信通知依赖 plugin-wecom 的 webhookUrl。未配置时引导用户去「插件」页绑定并发送测试。",
    "",

    // ── Tool Guide ──
    "## 可用工具及使用场景",
    "",
    "### tool-create-library-item（创建项目资料）",
    "- 用途：在项目下保存文档摘要、规则说明、研究笔记和其他非结构化资料。",
    "- 不用于创建客户、订单、发票等结构化业务记录。",
    `- 必传参数：enterpriseId="${input.context.enterpriseId}"、projectId="${input.context.projectId}"（直接用当前上下文的值，不要编造）、name（业务对象名称）、summary（关键信息摘要）。`,
    "- 可选参数：type（screenshot/spreadsheet/document/note，默认 note）、visibility（public/private，默认 public）。",
    "- 示例：用户说「把这份顾问跟进规范存到资料库」，调用此工具保存标题与摘要。",
    "",
    "### tool-business-query（业务数据查询 MCP）",
    "- 用途：在当前项目范围查询 dashboard、customers、customer_duplicates、customer_value、orders、payments、invoices、tasks、files、automations、library。",
    "- 企业和业务子类范围由当前对话自动注入。所有查询与写入只能作用于当前 enterpriseId + projectId 这一对上下文；禁止跨企业、跨业务子类汇总、读取或修改。",
    "- 参数：resource 必填；status、search、limit 可选。不接受任意 SQL，也不能跨企业或跨项目读取。不传 limit 时返回当前范围的全部匹配记录；只有用户明确要求取前 N 条或抽样时才传 limit。列表结果的 total 是符合条件的总数，returned 是本次返回条数，不得把 returned 当总数。",
    "- 统计总量时把 limit 设为 1 并只读取 total，不要为了计数分页拉取明细。查询逾期发票必须使用 resource=invoices、status=overdue、limit=1，total 就是精确逾期数；禁止按返回的明细自行估算。",
    "- 用户询问客户是否重复时，必须使用 resource=customer_duplicates。summary.scannedCustomers 是当前项目完整扫描数，重复组总数不受 limit 影响；禁止从 customers 的分页 items 判断项目内无重复。电话/邮箱是强重复证据，同名只能报告为待确认候选。",
    "- 用户询问最有价值客户、重点客户、最大客户或客户排名时，必须使用 resource=customer_value（通常 limit=10）。该资源在数据库内对当前项目客户、订单、已回款和应收完成聚合；禁止分页拉取 customers 和 orders 后自行拼接。",
    "- 同一个参数完全相同的工具调用只允许执行一次；拿到足够证据后立即给出最终结论，不要用过程说明结束回复。",
    "",
    "### tool-business-action（业务操作 MCP）",
    "- 用途：创建客户或待办，更新客户资料或客户/订单/发票状态，按电话安全合并重复客户。",
    "- operation 可选值：create_customer、create_task、update_customer、update_customer_status、update_order_status、update_invoice_status、deduplicate_customers_by_phone。",
    "- 用户要求修改客户姓名、联系人、电话、邮箱、地址、性别或标签时，使用 update_customer；优先先查询确认客户 ID。若没有 ID，update_customer 只可用当前业务子类内唯一的 phone 定位。update_customer_status 仅用于修改状态。批量合并只在用户明确要求时执行。",
    "",
    "### tool-csv-profile（表格结构分析）",
    "- 用途：读取当前项目已上传的 CSV/TSV/TXT/XLSX/XLSM，返回精确行数、表头、样例和空值统计。",
    "- 何时用：用户上传了表格文件，或说「分析这个表格」「看看这个 Excel」。优先使用项目上下文 Files 中的 fileId；也可以使用精确 fileName。",
    "",
    "### tool-mcp-company-context（企业资料查询）",
    "- 用途：检索资料库中的已记录事实，并读取当前项目的自动化规则和历史对话上下文。",
    "- 资料检索范围固定为两层，顺序是：当前业务子类的全部资料；同一企业内其他业务子类的 public 资料。不得读取其他企业资料，也不得读取其他业务子类的 private 资料。",
    "- 用户询问联系人电话、已有规范、历史记录或“资料库里有没有某人/某事”时，必须先调用本工具，再视需要调用 tool-business-query 查询客户、订单、发票等结构化数据。不能因为客户表未命中就断言资料库也不存在。",
    "- libraryItems 命中后，优先直接引用其中的 summary 回答，并说明它来自当前项目还是同企业公共资料；只有未命中时才说明未找到。",
    "- 参数：query（查询关键词）；企业和项目范围由当前对话自动注入。",
    "",
    "### tool-browser-check（网页巡检）",
    "- 用途：打开指定网页检查关键状态。",
    "- 何时用：用户说「检查一下 CRM 后台」「看看那个页面」。",
    "",
    "### tool-create-automation（创建自动化规则）",
    "- 用途：在项目下创建定时任务、消息触发等自动化规则。",
    "- 何时用：用户说「每天早上帮我...」「设置定时任务」「自动清理」「自动通知」等。",
    `- 必传参数：projectId="${input.context.projectId}"、name、trigger、triggerType、action、actionType。可执行动作只使用 call_ai、notify、tool_call。`,
    "- 需要修改业务数据时使用 actionType=tool_call，并传 actionToolId=tool-business-action 和 actionInput。邮件、Shell、任意 API 和浏览器动作尚未接入，不得创建。",
    "",
    "### tool-feishu-notify（消息推送，需配置）",
    "- 用途：推送消息到飞书/企业微信群。",
    "- 限制：需要先在「插件」页面配置 Webhook 才能使用。如果未配置，告诉用户去设置。",
    "",
    "### 飞书官方 MCP（已配置时可用）",
    "- 飞书官方 OpenAPI MCP 配置完成后，可直接查询和操作飞书消息、文档、多维表格、任务、日历、审批与组织信息。它以 mcp__feishu__ 前缀暴露工具，不需要把飞书数据复制进 EFH。",
    "- 先根据用户请求选择具体飞书工具；涉及删除、发送、修改权限、审批、人员或财务数据时，调用前必须在本轮清楚复述目标和影响范围。",
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
    `- 当前业务子类：${input.context.conversationTitle}`,
    `- 所属企业 ID（enterpriseId）：${input.context.enterpriseId}`,
    `- 业务子类 ID（projectId）：${input.context.projectId}`,
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
    "- 不要编造数据、执行状态或通知结果。一切以工具返回结果为准。",
    "- 只能使用当前 Skill 授权的工具；不要建议或假装调用未出现在工具列表中的能力。",
    "- 不要操作 settings、login、auth 相关路径。",
    "- 飞书通知工具未配置时不要强行使用，告诉用户去插件页配置。",
    "- 工具调用次数不设预算。持续执行到任务完成、模型自然结束、用户取消或服务超时为止。",
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
  for (let turn = 0; ; turn += 1) {
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

}
