import type { AgentRunEvent, AgentRunInput, AgentRunResult, AgentRuntime } from "./runtime.js";
import { HermesClient } from "./hermes-client.js";
import type { HermesSSEEvent } from "./hermes-client.js";
import type { AgentPlanStep, ToolRun } from "shared";

/**
 * HermesAgentRuntime delegates agent reasoning to a separate Hermes-Agent service.
 *
 * Flow:
 * 1. Build instructions (system prompt) from persona + skills + project context
 * 2. POST /v1/runs to Hermes with session_id, input, instructions, history
 * 3. Stream SSE events from /v1/runs/{run_id}/events
 *    - Hermes emits events INSIDE the JSON data payload:
 *      data: {"event":"message.delta","data":{"delta":"hello"}}
 * 4. Hermes handles tool execution internally (via its own MCP/plugins)
 * 5. Forward message.delta as content_chunk to caller
 * 6. Complete when Hermes emits run.completed
 *
 * Note: The Runs API does NOT accept a "tools" field. Business tools
 * are registered separately as Hermes MCP servers or plugin backends.
 */
export class HermesAgentRuntime implements AgentRuntime {
  private client: HermesClient;

  constructor() {
    this.client = new HermesClient();
  }

  // ── Synchronous run (used by legacy callers, waits for full result) ──

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const fullContent: string[] = [];
    const toolRuns: ToolRun[] = [];
    let planSteps: AgentPlanStep[] = [];

    for await (const event of this.runStream(input)) {
      switch (event.type) {
        case "content_chunk":
          fullContent.push(event.delta);
          break;
        case "tool_result":
          toolRuns.push({
            id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            toolId: event.toolId,
            status: event.status,
            input: {},
            output: event.output,
            createdAt: new Date().toISOString(),
          });
          break;
        case "done":
          return {
            content: event.content || fullContent.join(""),
            toolRuns: event.toolRuns.length > 0 ? event.toolRuns : toolRuns,
            planSteps: event.planSteps.length > 0 ? event.planSteps : planSteps,
          };
        case "error":
          if (fullContent.length > 0) {
            // Partial response — return what we have
            return { content: fullContent.join(""), toolRuns, planSteps };
          }
          throw new Error(event.message);
      }
    }

    return {
      content: fullContent.join(""),
      toolRuns,
      planSteps,
    };
  }

  // ── Streaming run (async generator) ──

  async *runStream(input: AgentRunInput): AsyncIterable<AgentRunEvent> {
    const toolRuns: ToolRun[] = [];
    const contentParts: string[] = [];
    let runId = "";

    try {
      // Build instructions with tool descriptions inline
      const instructions = buildInstructions(input);

      // Build Hermes run request (no "tools" field — Hermes uses MCP/plugins)
      const runReq = {
        session_id: `${input.context.enterpriseId}:${input.sessionId}`,
        input: input.userContent,
        instructions,
        conversation_history: HermesClient.toHermesMessages(input.history),
        model: process.env.HERMES_MODEL ?? "hermes-agent",
        metadata: {
          enterprise_id: input.context.enterpriseId,
          project_id: input.context.projectId,
        },
      };

      // Create the run
      const runResp = await this.client.createRun(runReq);
      runId = runResp.run_id;

      // Stream SSE events
      for await (const sseEvent of this.client.streamEvents(runId)) {
        const agentEvent = this.mapEvent(sseEvent, toolRuns, contentParts);
        if (agentEvent) {
          switch (agentEvent.type) {
            case "content_chunk":
              contentParts.push(agentEvent.delta);
              yield agentEvent;
              break;
            case "done":
              yield {
                type: "done",
                content: agentEvent.content || contentParts.join(""),
                toolRuns: agentEvent.toolRuns.length > 0 ? agentEvent.toolRuns : toolRuns,
                planSteps: agentEvent.planSteps,
              };
              return;
            case "error":
              yield agentEvent;
              return;
            default:
              yield agentEvent;
          }
        }
      }

      // If stream ends without done event, emit done with accumulated content
      yield {
        type: "done",
        content: contentParts.join(""),
        toolRuns,
        planSteps: [],
      };
    } catch (err) {
      yield {
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ── Stop Run ──

  async stopRun(runId: string): Promise<void> {
    await this.client.stopRun(runId);
  }

  // ── Health ──

  async health(): Promise<{ ok: boolean; version?: string; model?: string }> {
    const h = await this.client.health();
    return {
      ok: h.ok,
      version: h.version,
      model: h.model ?? process.env.HERMES_MODEL,
    };
  }

  // ── Event Mapper: Hermes raw → internal AgentRunEvent ──

  private mapEvent(
    sse: HermesSSEEvent,
    toolRuns: ToolRun[],
    _contentParts: string[],
  ): AgentRunEvent | null {
    switch (sse.event) {
      case "message.delta":
        return {
          type: "content_chunk",
          delta: sse.data.delta ?? "",
        };

      case "reasoning.available":
        return {
          type: "thinking",
          message: sse.data.text || "Agent is analyzing...",
        };

      case "tool.started": {
        const tr: ToolRun = {
          id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          toolId: sse.data.name ?? sse.data.id ?? "unknown",
          status: "success",
          input: sse.data.arguments ?? {},
          output: "",
          createdAt: new Date().toISOString(),
        };
        toolRuns.push(tr);
        return {
          type: "tool_call",
          toolId: tr.toolId,
          toolName: sse.data.name ?? sse.data.id ?? "unknown",
          input: sse.data.arguments ?? {},
        };
      }

      case "tool.completed": {
        // Update the matching tool run
        const existing = toolRuns.find((t) =>
          t.toolId === (sse.data.name ?? sse.data.id) && t.output === "",
        );
        if (existing) {
          existing.status = (sse.data.status as "success" | "error") ?? "success";
          existing.output = sse.data.output ?? "";
        }
        return {
          type: "tool_result",
          toolId: sse.data.name ?? sse.data.id ?? "unknown",
          status: (sse.data.status as "success" | "error") ?? "success",
          output: sse.data.output ?? "",
        };
      }

      case "run.completed":
        return {
          type: "done",
          content: sse.data.output ?? "",
          toolRuns,
          planSteps: [],
        };

      case "run.failed":
        return {
          type: "error",
          message: sse.data.error ?? "Hermes run failed",
        };

      default:
        return null;
    }
  }
}

// ── Instructions Builder ──

function buildInstructions(input: AgentRunInput): string {
  const parts: string[] = [];

  // Core system prompt
  parts.push(
    "你是 Enterprise Flow Hub 的内核 Agent，运行在中小企业轻量自动化平台中。你可以读取项目资料、分析表格和截图、创建业务记录、执行脚本、推送通知。",
    "",
    "## 核心行为准则",
    "1. **行动优先** — 用户说「帮我看」「帮我做」「查一下」时，必须先调用工具去执行，而不是只给文字建议。",
    "2. **先做再说** — 工具执行完成后，根据结果告诉用户发生了什么，不要预测结果。",
    "3. **持久化业务数据** — 用户提到的客户、订单等业务对象，必须用 tool-create-library-item 存入项目资料库。",
    "4. **告诉用户去哪看** — 创建了自动化规则后提醒用户去「自动化」页面查看，创建了资料后提醒去「业务资料」页面查看。",
    "5. **不要反问 EFH 基础设施** — EFH 后端、SQLite 数据库和插件配置由当前系统托管；涉及发票、订单、资料库、自动化、通知插件状态时，优先通过内部业务工具桥查询或操作，不要向用户索要 SSH、数据库文件路径或 EFH API 地址。",
    "",
    "## EFH 内部业务工具桥",
    "- Hermes 与 EFH 后端通过 Docker 内网连接。内部工具基础地址来自环境变量 EFH_INTERNAL_API_URL，认证头为 X-Internal-Key: $INTERNAL_API_KEY。",
    "- 当前企业和项目必须使用下方「当前工作上下文」里的 enterpriseId、projectId，不要编造 ID。启航留学线上企业 ID 是 ent-qihang；云杉贸易线上企业 ID 是 ent-yunshan。",
    "- 发票数据存放在 EFH 后端 SQLite 的 invoices 表；线上容器内路径是 /data/efh.db。但常规业务查询必须走内部工具或站内 API，不要直接读库。",
    "- 查发票：POST {EFH_INTERNAL_API_URL}/query-invoices，body: { enterprise_id, status?, page?, limit? }。返回 items/total/page/limit。",
    "- 查项目资料/自动化上下文：POST {EFH_INTERNAL_API_URL}/query-project-context，body: { enterprise_id, project_id 或 project_ids }。",
    "- 查飞书/企业微信通知是否已绑定：POST {EFH_INTERNAL_API_URL}/notification-status。",
    "- 发通知：POST {EFH_INTERNAL_API_URL}/send-notification，body: { enterprise_id, user_id?, plugin_id?, message }。如果 notification-status 显示未配置，不要强行发送，告诉用户去「插件」页绑定飞书 Webhook 或企业微信机器人。",
    "",
    "## 可用工具及使用场景",
  );

  // Include tool descriptions inline (since Hermes Runs API doesn't accept tools field)
  const enabledTools = input.tools.filter((t) => t.status === "enabled");
  if (enabledTools.length > 0) {
    for (const tool of enabledTools) {
      parts.push(`### ${tool.id}`);
      parts.push(`- 描述：${tool.description}`);
      parts.push(`- 类型：${tool.kind}`);
      parts.push(`- 参数示例：${tool.inputSchema}`);
      parts.push(`- 使用场景：${tool.examplePrompt}`);
      parts.push("");
    }
  }

  // Persona
  if (input.persona?.systemPrompt) {
    parts.push(`## 当前角色\n${input.persona.systemPrompt}\n`);
  }

  // Skills
  const enabledSkills = input.skills.filter((s) => s.enabled);
  if (enabledSkills.length > 0) {
    parts.push("## 已激活技能");
    for (const skill of enabledSkills) {
      parts.push(`### ${skill.name}\n${skill.prompt}\n`);
    }
  }

  // Project context
  parts.push(
    "## 当前工作上下文",
    `- 项目：${input.context.conversationTitle}`,
    `- 企业ID：${input.context.enterpriseId}`,
    `- 项目ID：${input.context.projectId}`,
    `- 资料范围：${input.context.contextLabel}`,
    "",
    "### 项目已有资料",
    input.context.projectContext || "暂无项目资料。",
    "",
  );

  // History note
  if (input.context.historyNote) {
    parts.push(input.context.historyNote, "");
  }

  // Output style
  parts.push(
    "## 回答风格",
    "- 使用中文，先给结论再展开细节。",
    "- 结构化输出优先：使用标题、列表、表格、代码块。",
    "- 工具执行结果要引用关键数据，不要笼统概括。",
    "- 如果用户需求不明确，问 1 个关键问题澄清。",
    "- 创建了东西要主动告诉用户去哪里查看。",
    "",
    "## 限制",
    "- 不要编造数据。以工具返回结果为准。",
    "- 飞书通知工具未配置时不要强行使用；先检查 notification-status。",
    "- 单次对话最多 10 轮工具调用。",
  );

  return parts.join("\n");
}
