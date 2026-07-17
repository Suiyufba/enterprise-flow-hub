import type {
  AgentPersona,
  AgentSkill,
  Message,
  ToolDefinition,
  ToolRun,
  AgentPlanStep,
} from "shared";
import type { AgentKernelContext, AgentRuntimeProvider } from "./kernel.js";

// ── Runtime Interface ──

export interface AgentRunInput {
  userContent: string;
  history: Message[];
  persona?: AgentPersona;
  skills: AgentSkill[];
  tools: ToolDefinition[];
  provider?: AgentRuntimeProvider;
  thinkingProvider?: AgentRuntimeProvider;
  context: AgentKernelContext;
  sessionId: string;
  abortController?: AbortController;
}

export interface AgentRunResult {
  content: string;
  toolRuns: ToolRun[];
  planSteps: AgentPlanStep[];
}

export type AgentRunEvent =
  | { type: "thinking"; message: string }
  | { type: "tool_call"; toolId: string; toolName: string; input: Record<string, unknown> }
  | { type: "tool_result"; toolId: string; status: "success" | "error"; output: string }
  | { type: "content_chunk"; delta: string }
  | { type: "plan_update"; planSteps: AgentPlanStep[] }
  | { type: "done"; content: string; toolRuns: ToolRun[]; planSteps: AgentPlanStep[] }
  | { type: "error"; message: string };

export interface AgentRuntime {
  /** Run agent synchronously, returning full result when done */
  run(input: AgentRunInput): Promise<AgentRunResult>;

  /** Run agent with streaming events */
  runStream(input: AgentRunInput): AsyncIterable<AgentRunEvent>;

  /** Check if runtime is healthy */
  health(): Promise<{ ok: boolean; version?: string; model?: string }>;
}

// ── Runtime Factory ──

export async function getRuntime(_userId?: string): Promise<AgentRuntime> {
  const runtimeMode = (process.env.AGENT_RUNTIME ?? "claude-code").trim();
  if (runtimeMode === "legacy") {
    return await getLegacyRuntime();
  }
  return await getClaudeCodeRuntime();
}

export function resetRuntimeCache(): void {
  // Runtimes are stateless; EFH owns conversation persistence.
}

// ── Lazy imports to avoid circular deps (ESM-compatible dynamic import) ──

async function getLegacyRuntime(): Promise<AgentRuntime> {
  const { LegacyAgentRuntime } = await import("./legacy-runtime.js");
  return new LegacyAgentRuntime();
}

async function getClaudeCodeRuntime(): Promise<AgentRuntime> {
  const { ClaudeCodeRuntime } = await import("./claude-code-runtime.js");
  return new ClaudeCodeRuntime();
}
