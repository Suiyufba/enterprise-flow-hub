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
  tool_call_id?: string;
  name?: string;
};

export type AgentRuntimeProvider = ModelProvider & {
  apiKeyEnv?: string;
};

export type AgentKernelContext = {
  conversationTitle: string;
  contextLabel: string;
  projectContext: string;
};

export type AgentKernelInput = {
  userContent: string;
  history: Message[];
  persona?: AgentPersona;
  skills: AgentSkill[];
  tools: ToolDefinition[];
  provider?: AgentRuntimeProvider;
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
    .map((t) => ({
      name: t.id,
      description: t.description,
      parameters: t.inputSchema
        ? { type: "object", properties: t.inputSchema as unknown as Record<string, unknown>, required: [] }
        : { type: "object", properties: {}, required: [] },
    }));
}

function buildSystemPrompt(input: AgentKernelInput): string {
  const skillPrompt = input.skills
    .filter((s) => s.enabled)
    .map((s) => `## Skill: ${s.name}\n${s.prompt}`)
    .join("\n\n");

  return [
    "你是 Enterprise Flow Hub 的网站内核 Agent。你有工具可以执行实际操作——读取文件、运行命令、写入内容。遇到用户请求时，优先使用工具去执行而不是只给建议。",
    "重要原则：",
    "- 用户说「部署」时，用 bash 工具执行部署命令",
    "- 用户说「查」或「看」时，用对应工具读取数据",
    "- 工具执行完以后，根据结果告诉用户发生了什么",
    "- 不要只描述怎么做，要真的去做",
    input.persona?.systemPrompt,
    skillPrompt,
    `## 对话信息
标题：${input.context.conversationTitle}
资料范围：${input.context.contextLabel}`,
    `## 项目上下文
${input.context.projectContext || "暂无项目资料。"}`,
    "## 风格\n用中文回答。先给结论再给细节。",
  ].filter(Boolean).join("\n\n");
}

function toProviderOptions(p?: AgentRuntimeProvider): AiProviderOptions | undefined {
  if (!p?.enabled) return undefined;
  return {
    baseUrl: p.baseUrl,
    model: p.model,
    apiKey: p.apiKeyEnv ? process.env[p.apiKeyEnv] : undefined,
  };
}

function historyToMessages(history: Message[]): ChatMessage[] {
  return history.slice(-24).map((m) => ({
    role: m.role as ChatMessage["role"],
    content: m.content,
  }));
}

function toolRunsToMessages(toolCalls: ToolCall[], results: Array<{ toolId: string; output: string }>): ChatMessage[] {
  // Assistant message with tool_calls is not needed in text form when we use
  // native function calling — we send tool result messages directly
  return results.map((r, i) => ({
    role: "tool" as const,
    tool_call_id: toolCalls[i]?.id ?? r.toolId,
    content: r.output,
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
  const provider = toProviderOptions(input.provider);
  const maxTurns = input.maxTurns ?? 10;

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const resp = await aiChatMessages(messages, {
      temperature: 0.7,
      maxTokens: 3072,
      provider,
      tools: functionDefs,
    });

    // No tool calls — agent is done
    if (resp.toolCalls.length === 0) {
      const finalContent = resp.content || "任务已完成。";
      return { content: finalContent, toolRuns };
    }

    // Execute tool calls
    const results: Array<{ toolId: string; output: string }> = [];

    // Add assistant response (may have content + tool_calls)
    messages.push({
      role: "assistant",
      content: resp.content || "",
      // Note: native tool_calls are not added as text; the API expects
      // tool result messages to follow with matching tool_call_id
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
