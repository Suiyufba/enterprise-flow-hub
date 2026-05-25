import type {
  AgentPersona,
  AgentSkill,
  Message,
  ModelProvider,
  ToolDefinition,
  ToolRun,
} from "shared";
import { aiChatMessages, type AiProviderOptions } from "../ai/client.js";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
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

type ToolRequest = {
  tool: string;
  input?: Record<string, unknown>;
  reason?: string;
};

function enabledToolList(tools: ToolDefinition[]): string {
  return tools
    .filter((tool) => tool.status === "enabled")
    .map((tool) => {
      return [
        `- ${tool.id}: ${tool.name}`,
        `  kind: ${tool.kind}`,
        `  risk: ${tool.risk}`,
        `  description: ${tool.description}`,
        `  inputSchema: ${tool.inputSchema}`,
        `  example: ${tool.examplePrompt}`,
      ].join("\n");
    })
    .join("\n");
}

function buildSystemPrompt(input: AgentKernelInput): string {
  const toolList = enabledToolList(input.tools);
  const skillPrompt = input.skills
    .filter((skill) => skill.enabled)
    .map((skill) => `## Skill: ${skill.name}\n${skill.prompt}`)
    .join("\n\n");

  const toolInstruction = toolList
    ? `## Tool protocol
你可以调用后端工具。需要工具时，只输出一个或多个 JSON 代码块，每个代码块格式如下：
\`\`\`tool
{"tool":"tool-id","reason":"为什么需要这个工具","input":{"参数":"值"}}
\`\`\`
工具结果会作为下一轮上下文返回给你。拿到工具结果后，再给用户正常回复。
读操作工具可直接执行；写入或管理风险工具会以 dry-run 方式预演，除非系统未来接入显式审批。

## Available tools
${toolList}`
    : "## Tool protocol\n当前没有已启用工具。";

  return [
    "你是 Enterprise Flow Hub 的网站内核 Agent。这个产品本身就是一个企业流程 agent：你需要理解业务目标、读取项目资料、选择技能、必要时调用工具，并把输出落到可执行的流程、自动化、看板和下一步动作。",
    input.persona?.systemPrompt,
    skillPrompt,
    `## Conversation
标题：${input.context.conversationTitle}
资料范围：${input.context.contextLabel}`,
    `## Project context
${input.context.projectContext || "暂无项目资料。需要时请先向用户确认缺失信息。"}`,
    toolInstruction,
    "## Response style\n用中文回答。优先给出清晰结论和下一步动作；当信息不足时，说明缺口并给出最小可行假设。",
  ].filter(Boolean).join("\n\n");
}

function toProviderOptions(provider?: AgentRuntimeProvider): AiProviderOptions | undefined {
  if (!provider?.enabled) return undefined;
  return {
    baseUrl: provider.baseUrl,
    model: provider.model,
    apiKey: provider.apiKeyEnv ? process.env[provider.apiKeyEnv] : undefined,
  };
}

function historyToChatMessages(history: Message[]): ChatMessage[] {
  return history.slice(-24).map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function extractToolRequests(content: string): ToolRequest[] {
  const requests: ToolRequest[] = [];
  const matches = content.matchAll(/```tool\s*\n([\s\S]*?)\n```/g);
  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1]) as ToolRequest | ToolRequest[];
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (typeof item.tool === "string") {
          requests.push({
            tool: item.tool,
            reason: typeof item.reason === "string" ? item.reason : undefined,
            input: item.input && typeof item.input === "object" ? item.input : {},
          });
        }
      }
    } catch {
      requests.push({
        tool: "",
        reason: "Invalid tool JSON",
        input: { raw: match[1] },
      });
    }
  }
  return requests;
}

function stripToolBlocks(content: string): string {
  return content.replace(/```tool\s*\n[\s\S]*?\n```/g, "").trim();
}

export async function runAgentKernel(input: AgentKernelInput): Promise<AgentKernelResult> {
  const toolsById = new Map(input.tools.map((tool) => [tool.id, tool]));
  const toolRuns: ToolRun[] = [];
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(input) },
    ...historyToChatMessages(input.history),
  ];
  const provider = toProviderOptions(input.provider);
  const maxTurns = input.maxTurns ?? 6;

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const response = await aiChatMessages(messages, {
      temperature: 0.7,
      maxTokens: 3072,
      provider,
    });
    const requests = extractToolRequests(response);

    if (requests.length === 0) {
      return {
        content: stripToolBlocks(response) || response,
        toolRuns,
      };
    }

    messages.push({ role: "assistant", content: response });
    const toolResults: string[] = [];

    for (const request of requests) {
      const tool = toolsById.get(request.tool);
      if (!tool || tool.status !== "enabled") {
        toolResults.push(`工具 ${request.tool || "(invalid)"} 不存在或未启用。`);
        continue;
      }

      const dryRun = tool.risk !== "read_only";
      const run = await input.runTool(tool.id, request.input ?? {}, {
        dryRun,
        reason: request.reason ?? "agent requested tool",
      });
      if (run) {
        toolRuns.push(run);
        toolResults.push(
          [
            `工具：${tool.name} (${tool.id})`,
            `模式：${dryRun ? "dry-run" : "live"}`,
            `状态：${run.status}`,
            `输入：${JSON.stringify(run.input)}`,
            `输出：${run.output}`,
          ].join("\n"),
        );
      } else {
        toolResults.push(`工具 ${tool.id} 执行失败。`);
      }
    }

    messages.push({
      role: "user",
      content: `工具执行结果如下：\n\n${toolResults.join("\n\n---\n\n")}\n\n请基于这些结果继续完成用户任务。不要再重复工具 JSON，除非还必须调用其他工具。`,
    });
  }

  return {
    content: "我已经完成了多轮工具尝试，但还没有得到稳定结论。请缩小一下任务范围或补充关键资料，我可以继续处理。",
    toolRuns,
  };
}
