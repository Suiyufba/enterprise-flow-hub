import {
  createSdkMcpServer,
  query,
  type SDKMessage,
  type SdkMcpToolDefinition,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { mkdirSync } from "node:fs";
import type { ToolDefinition, ToolRun } from "shared";
import { buildSystemPrompt, type AgentKernelInput } from "./kernel.js";
import type { AgentRunEvent, AgentRunInput, AgentRunResult, AgentRuntime } from "./runtime.js";

const CLAUDE_CODE_VERSION = "2.1.87";

function providerBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/$/, "");
  try {
    const url = new URL(normalized);
    if (url.hostname === "api.deepseek.com" && !url.pathname.endsWith("/anthropic")) {
      return `${url.origin}/anthropic`;
    }
  } catch {
    // Claude Code will return the provider's URL error with its normal diagnostics.
  }
  return normalized;
}

function inputShape(definition: ToolDefinition): Record<string, z.ZodTypeAny> {
  try {
    const example = JSON.parse(definition.inputSchema) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(example).map(([key, value]) => {
      if (typeof value === "number") return [key, z.number().optional()];
      if (typeof value === "boolean") return [key, z.boolean().optional()];
      if (Array.isArray(value)) return [key, z.array(z.unknown()).optional()];
      if (value && typeof value === "object") return [key, z.record(z.string(), z.unknown()).optional()];
      return [key, z.string().optional()];
    }));
  } catch {
    return {};
  }
}

function historyPrompt(input: AgentRunInput): string {
  const history = input.history
    .slice(-30)
    .map((message) => `${message.role === "user" ? "用户" : "Agent"}: ${message.content}`)
    .join("\n\n");
  return [
    history ? `以下是此前的站内对话记录：\n\n${history}` : "",
    `用户当前请求：\n${input.userContent}`,
  ].filter(Boolean).join("\n\n---\n\n");
}

function kernelInput(input: AgentRunInput): AgentKernelInput {
  return {
    ...input,
    runTool: async () => undefined,
  };
}

function textDelta(message: SDKMessage): string | undefined {
  if (message.type !== "stream_event" || message.event.type !== "content_block_delta") return undefined;
  const delta = message.event.delta;
  return delta.type === "text_delta" ? delta.text : undefined;
}

export class ClaudeCodeRuntime implements AgentRuntime {
  async run(input: AgentRunInput): Promise<AgentRunResult> {
    let result: AgentRunResult = { content: "", toolRuns: [], planSteps: [] };
    for await (const event of this.runStream(input)) {
      if (event.type === "done") {
        result = {
          content: event.content,
          toolRuns: event.toolRuns,
          planSteps: event.planSteps,
        };
      }
      if (event.type === "error") throw new Error(event.message);
    }
    return result;
  }

  async *runStream(input: AgentRunInput): AsyncIterable<AgentRunEvent> {
    if (!input.provider?.apiKey) {
      yield { type: "error", message: "Claude Code 需要已配置 API Key 的模型账号" };
      return;
    }

    const toolRuns: ToolRun[] = [];
    const pendingEvents: AgentRunEvent[] = [];
    const permittedToolIds = new Set([
      "tool-business-query",
      "tool-mcp-company-context",
      "tool-create-library-item",
      "tool-create-automation",
      ...input.skills.flatMap((skill) => skill.toolIds),
    ]);
    const enabledTools = input.tools.filter((definition) =>
      definition.status === "enabled" && definition.risk !== "admin" && permittedToolIds.has(definition.id),
    );
    const mcpTools: SdkMcpToolDefinition[] = enabledTools.map((definition) => ({
      name: definition.id,
      description: definition.description,
      inputSchema: inputShape(definition),
      handler: async (args) => {
        const toolInput = {
          ...(args as Record<string, unknown>),
          _enterpriseId: input.context.enterpriseId,
          _projectId: input.context.projectId,
          _conversationId: input.sessionId,
        };
        pendingEvents.push({
          type: "tool_call",
          toolId: definition.id,
          toolName: definition.name,
          input: toolInput,
        });
        let result: ToolRun | undefined;
        try {
          const { runTool } = await import("../store.js");
          result = await runTool(definition.id, {
            input: { ...toolInput, _agentReason: "Claude Code MCP tool call" },
            dryRun: false,
          });
        } catch (error) {
          const output = error instanceof Error ? error.message : String(error);
          pendingEvents.push({ type: "tool_result", toolId: definition.id, status: "error", output });
          return { content: [{ type: "text" as const, text: output }], isError: true };
        }
        if (!result) {
          pendingEvents.push({ type: "tool_result", toolId: definition.id, status: "error", output: "Tool not found" });
          return { content: [{ type: "text" as const, text: "Tool not found" }], isError: true };
        }
        toolRuns.push(result);
        pendingEvents.push({
          type: "tool_result",
          toolId: definition.id,
          status: result.status,
          output: result.output,
        });
        return {
          content: [{ type: "text" as const, text: result.output }],
          isError: result.status === "error",
        };
      },
    }));
    const mcpServer = createSdkMcpServer({ name: "efh", version: "1.0.0", tools: mcpTools });
    const allowedTools = enabledTools.map((definition) => `mcp__efh__${definition.id}`);
    const model = input.provider.model;
    const baseUrl = providerBaseUrl(input.provider.baseUrl);
    const cwd = process.env.CLAUDE_CODE_WORKDIR ?? "/tmp/efh-agent";
    mkdirSync(cwd, { recursive: true });
    let content = "";

    yield { type: "thinking", message: "Claude Code 正在分析业务上下文..." };

    const agentQuery = query({
      prompt: historyPrompt(input),
      options: {
        abortController: input.abortController,
        cwd,
        env: {
          ...process.env,
          ANTHROPIC_BASE_URL: baseUrl,
          ANTHROPIC_AUTH_TOKEN: input.provider.apiKey,
          ANTHROPIC_API_KEY: input.provider.apiKey,
          ANTHROPIC_MODEL: model,
          ANTHROPIC_DEFAULT_OPUS_MODEL: model,
          ANTHROPIC_DEFAULT_SONNET_MODEL: model,
          ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
          CLAUDE_CODE_SUBAGENT_MODEL: model,
          CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
          DISABLE_TELEMETRY: "1",
        },
        includePartialMessages: true,
        maxTurns: 10,
        mcpServers: { efh: mcpServer },
        model,
        pathToClaudeCodeExecutable: process.env.CLAUDE_CODE_EXECUTABLE || undefined,
        permissionMode: "dontAsk",
        allowedTools,
        tools: [],
        persistSession: false,
        settingSources: [],
        systemPrompt: buildSystemPrompt(kernelInput(input)),
      },
    });

    try {
      for await (const message of agentQuery) {
        while (pendingEvents.length) yield pendingEvents.shift()!;

        const delta = textDelta(message);
        if (delta) {
          content += delta;
          yield { type: "content_chunk", delta };
        }
        if (message.type === "result") {
          if (message.subtype !== "success") {
            throw new Error(message.errors.join("; ") || `Claude Code stopped: ${message.subtype}`);
          }
          if (!content && message.result) {
            content = message.result;
            yield { type: "content_chunk", delta: message.result };
          } else if (message.result) {
            content = message.result;
          }
        }
      }
      while (pendingEvents.length) yield pendingEvents.shift()!;
      yield { type: "done", content, toolRuns, planSteps: [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      yield { type: "error", message };
    } finally {
      agentQuery.close();
    }
  }

  async health(): Promise<{ ok: boolean; version?: string; model?: string }> {
    return {
      ok: true,
      version: CLAUDE_CODE_VERSION,
      model: "由用户模型账号决定",
    };
  }
}
